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
import { INLINE_FLIGHT_STREAM_GLOBAL } from "../../plugin/utils/inlineFlightId.js";

// The CONFIG path, end to end, in a real browser: `build.inlineFlight:
// "stream"` in the plugin config → the bake exports the mode → the request
// handler streams the document with interleaved flight chunks → the browser
// consumes them through takeStreamedFlight and HYDRATES (a client component
// responds to a click), with zero hydration errors and no /index.rsc fetch.
// Nothing in this test states "stream" outside the build config — that IS the
// assertion.
const createEdgeHandler = (streamApi as { createEdgeHandler?: unknown })
  .createEdgeHandler; // client-only export: gates the suite to the client leg

const browserAvailable = (() => {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
})();

const testDir = resolve(__dirname, "../fixtures/edge-stream-hydration.test");
const PORT = 4187;

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
    `import React from "react";\n` +
      `import { Counter } from "./Counter.client.js";\n` +
      `export const Page = () => (\n` +
      `  <div id="app">\n` +
      `    <h1>{"stream-hydration"}</h1>\n` +
      `    <Counter />\n` +
      `  </div>\n` +
      `);\n`
  );
  // The canonical supplied client entry — assembles initial-payload
  // consumption (blob OR streamed, via createReactFetcher) + hydration.
  // moduleBaseURL is "" (not "/"): the browser transport string-concatenates
  // base + id, and "/" + "/routes/x.js" makes a "//routes/x.js" URL — same
  // bytes served, DIFFERENT module identity, so shared chunks (React!) load
  // twice and hooks crash. Tracked as the base+id join normalization bead.
  await writeFile(
    join(testDir, "src/client.tsx"),
    `import { startClient } from "vite-plugin-react-server/router/client";\n` +
      `startClient({ moduleBaseURL: "" });\n`
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
    // Static hosts normalize duplicate slashes (moduleBaseURL "/" + an
    // id that already starts with "/"); mirror that.
    url.pathname = url.pathname.replace(/\/{2,}/g, "/");
    // Asset requests go to the built outputs (client bundle, static assets).
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
  "edge stream mode — real build, real browser hydration",
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
          // The one and only place "stream" is stated.
          inlineFlight: "stream",
        },
      } as any);

      const bundle = await import(
        pathToFileURL(join(testDir, "dist/server-edge/render.js")).href
      );
      const { createEdgeRequestHandler } = await import(
        "vite-plugin-react-server/edge"
      );
      // Zero-config on purpose: the SERVER decode resolves client references
      // through the bundle's baked file-url clientModuleBaseURL; the BROWSER
      // resolves them via startClient's own moduleBaseURL ("/") over this
      // server's static bridge.
      const handler = createEdgeRequestHandler(bundle);
      server = serve(handler, [
        join(testDir, "dist/static"),
        join(testDir, "dist/client"),
      ]);
      await new Promise<void>((r) => server!.listen(PORT, r));

      rawHtml = await (await fetch(`http://localhost:${PORT}/`)).text();
    }, 180000);

    afterAll(async () => {
      await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
      if (!process.env.KEEP_FIXTURE)
        await rm(testDir, { recursive: true, force: true });
    });

    it("the wire carries interleaved push scripts, not a blob element", () => {
      expect(rawHtml).toContain(INLINE_FLIGHT_STREAM_GLOBAL);
      expect(rawHtml).not.toContain('id="vprs-flight"');
      expect(rawHtml).toContain("stream-hydration");
      // The sentinel closes the protocol and the trailer stays last.
      expect(rawHtml).toContain(".push(null)");
      expect(rawHtml.trimEnd().endsWith("</html>")).toBe(true);
    });

    it("hydrates from the streamed payload: interactive, error-free, no /index.rsc fetch", async () => {
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        const pageErrors: string[] = [];
        const consoleErrors: string[] = [];
        const rscFetches: string[] = [];
        page.on("pageerror", (e) => pageErrors.push(String(e)));
        page.on("console", (m) => {
          if (m.type() === "error") consoleErrors.push(m.text());
        });
        page.on("request", (r) => {
          if (r.url().includes("index.rsc")) rscFetches.push(r.url());
        });

        await page.goto(`http://localhost:${PORT}/`, {
          waitUntil: "networkidle",
        });

        // Hydration proof: the client component answers a click. The button
        // exists in the server HTML long before React attaches, so POLL with
        // clicks until one lands — the first observed increment IS the
        // hydration-complete signal (the bidoof e2e discipline).
        const counter = page.locator("#counter");
        await counter.waitFor({ timeout: 15000 });
        await page.waitForFunction(
          () => {
            const b = document.querySelector("#counter") as HTMLButtonElement;
            if (!b) return false;
            b.click();
            return b.textContent !== "count:0";
          },
          undefined,
          { timeout: 20000, polling: 400 }
        );
        expect(await counter.textContent()).toMatch(/^count:[1-9]/);

        // No hydration mismatches (#418/#423/#425) and no error of any kind.
        expect(pageErrors).toEqual([]);
        expect(
          consoleErrors.filter((e) => /#4(18|23|25)|hydrat/i.test(e))
        ).toEqual([]);

        // The streamed payload was consumed — the client never fell back to
        // fetching index.rsc for the initial route.
        expect(rscFetches).toEqual([]);
      } finally {
        await browser.close();
      }
    });
  }
);
