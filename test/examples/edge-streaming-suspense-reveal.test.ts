import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { resolve, join, extname } from "node:path";
import { pathToFileURL } from "node:url";
import * as streamApi from "vite-plugin-react-server/stream";
import { chromium } from "playwright";
import { doBuild } from "../doBuild.js";
import { fileRouter } from "../../plugin/router/fileRouter.js";

// The LIVE half of the Suspense support claim, in a real browser: the
// prerender port deliberately kept per-request paths STREAMING, and this
// proves the streaming reveal itself on the edge document path
// (createEdgeRequestHandler + inlineFlight "stream", the natural fixture).
// A boundary that resolves MID-RESPONSE must:
//   - paint the shell first, fallback visible;
//   - swap the resolved content in WITHOUT a navigation or reload;
//   - be interactive after the reveal (a client component inside the
//     boundary answers clicks);
//   - produce no hydration errors.
// The static half of the claim is pinned by static-suspense-hydration; this
// is its per-request counterpart, where the streamed shape (fallback +
// hidden content + $RC swap) is the CORRECT wire format.
const createEdgeHandler = (streamApi as { createEdgeHandler?: unknown })
  .createEdgeHandler; // client-only export: gates the suite to the client leg

const browserAvailable = (() => {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
})();
if (!browserAvailable && process.env["VPRS_REQUIRE_BROWSER"]) {
  throw new Error(
    "VPRS_REQUIRE_BROWSER is set but Playwright Chromium is not installed"
  );
}

const testDir = resolve(
  __dirname,
  "../fixtures/edge-streaming-suspense-reveal.test"
);
const PORT = 4217;
// Long enough that a browser observes the fallback before the boundary
// resolves, short enough not to drag the suite.
const DELAY_MS = 2500;

const MIME: Record<string, string> = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".map": "application/json",
};

async function setupFixture() {
  await mkdir(join(testDir, "src/routes"), { recursive: true });
  await writeFile(
    join(testDir, "src/routes/Counter.client.tsx"),
    `"use client";\n` +
      `import * as React from "react";\n` +
      `export function Counter() {\n` +
      `  const [n, setN] = React.useState(0);\n` +
      `  return (\n` +
      `    <button id="counter" onClick={() => setN((v) => v + 1)}>\n` +
      `      {"count:" + n}\n` +
      `    </button>\n` +
      `  );\n` +
      `}\n`
  );
  await writeFile(
    join(testDir, "src/routes/page.tsx"),
    `import * as React from "react";\n` +
      `import { Suspense } from "react";\n` +
      `import { Counter } from "./Counter.client.js";\n` +
      `async function Delayed() {\n` +
      `  await new Promise((r) => setTimeout(r, ${DELAY_MS}));\n` +
      `  return (\n` +
      `    <section data-resolved="yes">\n` +
      `      <Counter />\n` +
      `    </section>\n` +
      `  );\n` +
      `}\n` +
      `export const Page = () => (\n` +
      `  <main id="app">\n` +
      `    <h1>{"streaming-reveal"}</h1>\n` +
      `    <Suspense fallback={<div id="fallback">{"loading"}</div>}>\n` +
      `      <Delayed />\n` +
      `    </Suspense>\n` +
      `  </main>\n` +
      `);\n`
  );
  await writeFile(
    join(testDir, "src/client.tsx"),
    `"use client";\n` +
      `import { startClient } from "vite-plugin-react-server/router/client";\n` +
      `startClient({ moduleBaseURL: "/" });\n`
  );
  await writeFile(
    join(testDir, "index.html"),
    `<!DOCTYPE html><html><head></head><body><div id="root"></div>` +
      `<script type="module" src="/src/client.tsx"></script></body></html>`
  );
  try {
    await symlink(
      resolve(__dirname, "../../node_modules"),
      join(testDir, "node_modules"),
      "dir"
    );
  } catch {
    /* already linked */
  }
}

/** Minimal Node bridge: edge fetch handler first, static files second. */
function serve(
  edgeHandler: (req: Request) => Promise<Response>,
  staticRoots: string[]
): Server {
  return createServer(async (req, res) => {
    const rawPath = (req.url ?? "/").replace(/^\/{2,}/, "/");
    const url = new URL(rawPath, `http://localhost:${PORT}`);
    url.pathname = url.pathname.replace(/\/{2,}/g, "/");
    for (const root of staticRoots) {
      const file = join(root, url.pathname);
      if (extname(file) && existsSync(file) && file.startsWith(root)) {
        res.writeHead(200, {
          "content-type": MIME[extname(file)] ?? "application/octet-stream",
        });
        res.end(readFileSync(file));
        return;
      }
    }
    const response = await edgeHandler(
      new Request(url.href, { headers: { accept: "text/html" } })
    );
    res.writeHead(
      response.status,
      Object.fromEntries(response.headers.entries())
    );
    const body = response.body;
    if (!body) return void res.end();
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      res.write(chunk);
    }
    res.end();
  });
}

describe.skipIf(!createEdgeHandler || !browserAvailable)(
  "edge streaming Suspense — the boundary reveals mid-response in a real browser",
  () => {
    let server: Server | undefined;
    let rawHtml = "";

    beforeAll(async () => {
      await rm(testDir, { recursive: true, force: true });
      await setupFixture();
      const fr = fileRouter(join(testDir, "src/routes"), { root: testDir });
      await doBuild({
        projectRoot: testDir,
        moduleBase: "src",
        Page: fr.Page,
        props: fr.props,
        routePatterns: fr.routePatterns,
        build: {
          pages: fr.build.pages,
          outDir: "dist",
          edge: true,
          inlineFlight: "stream",
        },
      } as any);

      const bundle = await import(
        pathToFileURL(join(testDir, "dist/server-edge/render.js")).href
      );
      const { createEdgeRequestHandler } = await import(
        "vite-plugin-react-server/edge"
      );
      const handler = createEdgeRequestHandler(bundle);
      server = serve(handler, [
        join(testDir, "dist/static"),
        join(testDir, "dist/client"),
      ]);
      await new Promise<void>((r) => server!.listen(PORT, r));

      rawHtml = await (await fetch(`http://localhost:${PORT}/`)).text();
    }, 240000);

    afterAll(async () => {
      await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
      if (!process.env["KEEP_FIXTURE"])
        await rm(testDir, { recursive: true, force: true });
    });

    it("the wire is the STREAMED shape: fallback first, content later, a swap script", () => {
      // Per-request delivery is progressive on purpose — the opposite of the
      // static artifact contract. Fallback-in-place precedes the resolved
      // content, which arrives hidden with an inline swap.
      const fallbackAt = rawHtml.indexOf('id="fallback"');
      const resolvedAt = rawHtml.indexOf('data-resolved="yes"');
      expect(fallbackAt).toBeGreaterThan(-1);
      expect(resolvedAt).toBeGreaterThan(fallbackAt);
      expect(rawHtml).toContain("<template");
      expect(rawHtml).toContain("$RC");
      expect(rawHtml.trimEnd().endsWith("</html>")).toBe(true);
    });

    it("shell paints with the fallback, the content swaps in, and the boundary is interactive", async () => {
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        const pageErrors: string[] = [];
        const consoleErrors: string[] = [];
        const documentRequests: string[] = [];
        page.on("pageerror", (e) => pageErrors.push(String(e)));
        page.on("console", (m) => {
          if (m.type() === "error") consoleErrors.push(m.text());
        });
        page.on("request", (r) => {
          if (r.resourceType() === "document") documentRequests.push(r.url());
        });

        // "commit" returns as soon as the response starts — the stream is
        // still open, which is the whole point.
        await page.goto(`http://localhost:${PORT}/`, { waitUntil: "commit" });

        // Progressive reveal, observed in order: the fallback is on screen
        // while the boundary is pending, then the resolved content replaces
        // it without any navigation.
        await page.waitForSelector("#fallback", {
          state: "visible",
          timeout: Math.max(500, DELAY_MS - 250),
        });
        const timeOrigin = await page.evaluate(() => performance.timeOrigin);
        await page.waitForSelector("[data-resolved='yes']", {
          state: "visible",
          timeout: 20000,
        });
        expect(await page.locator("#fallback").count()).toBe(0);

        // Interactive after the reveal: the client component inside the
        // boundary answers clicks (first observed increment = hydration).
        await page.waitForFunction(
          () => {
            const b = document.querySelector("#counter") as HTMLButtonElement;
            if (!b) return false;
            b.click();
            return b.textContent !== "count:0";
          },
          undefined,
          { timeout: 20000, polling: 300 }
        );

        // Same document the whole way: no reload performed the swap.
        expect(await page.evaluate(() => performance.timeOrigin)).toBe(
          timeOrigin
        );
        expect(documentRequests.length).toBe(1);
        expect(pageErrors).toEqual([]);
        expect(
          consoleErrors.filter((e) => /#4(18|19|23|25)|hydrat/i.test(e))
        ).toEqual([]);
      } finally {
        await browser.close();
      }
    });
  }
);
