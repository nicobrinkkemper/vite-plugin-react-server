import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { resolve, join, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { doBuild } from "../doBuild.js";
import { fileRouter } from "../../plugin/router/fileRouter.js";

/**
 * The server-action round-trip, end to end in a real browser, under
 * transport:"webpack" through the baked pair — the path a green release
 * shipped broken because no test drove it.
 *
 * Two regressions pinned at once:
 * - The sealed gate's allowlist follows the `"use server"` DIRECTIVE, not the
 *   `.server.` filename convention: the action module here is named
 *   `ping.ts` on purpose. Under the filename rule it was registered and
 *   serialized but rejected at the trust boundary at runtime ("Unknown
 *   server reference").
 * - The browser leg (proxy → callServer → encodeReply → gate → response
 *   decode) must run through the webpack flight client end to end.
 */

const browserAvailable = (() => {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
})();

const testDir = resolve(__dirname, "../fixtures/edge-action-roundtrip.test");
const PORT = 4189;

const MIME: Record<string, string> = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".map": "application/json",
};

async function setupFixture() {
  await mkdir(join(testDir, "src/routes"), { recursive: true });
  // The action module: "use server" directive, deliberately NOT named
  // *.server.* — membership must come from the directive.
  await writeFile(
    join(testDir, "src/ping.ts"),
    `"use server";\n` +
      `export async function ping(n: number): Promise<{ doubled: number }> {\n` +
      `  return { doubled: n * 2 };\n` +
      `}\n`
  );
  await writeFile(
    join(testDir, "src/routes/PingButton.client.tsx"),
    `"use client";\n` +
      `import * as React from "react";\n` +
      `export function PingButton({ ping }: { ping: (n: number) => Promise<{ doubled: number }> }) {\n` +
      `  const [result, setResult] = React.useState<number | null>(null);\n` +
      `  return (\n` +
      `    <button id="ping" onClick={async () => setResult((await ping(21)).doubled)}>\n` +
      `      {result === null ? "ping" : "doubled:" + result}\n` +
      `    </button>\n` +
      `  );\n` +
      `}\n`
  );
  await writeFile(
    join(testDir, "src/routes/page.tsx"),
    `import React from "react";\n` +
      `import { ping } from "../ping.js";\n` +
      `import { PingButton } from "./PingButton.client.js";\n` +
      `export const Page = () => (\n` +
      `  <div id="app">\n` +
      `    <h1>{"action-roundtrip"}</h1>\n` +
      `    <PingButton ping={ping} />\n` +
      `  </div>\n` +
      `);\n`
  );
  await writeFile(
    join(testDir, "src/client.tsx"),
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

function serve(
  handler: (req: Request) => Promise<Response | null>,
  staticRoots: string[]
): Server {
  // Under the base-url rerun the build's urls all carry BASE, so the app is
  // MOUNTED there — the deployment reality a subpath host (GH Pages, an
  // nginx location) provides. Stripping the prefix up front puts both the
  // static lookup and the handler back in root shape, like a reverse proxy.
  const base = process.env.VITE_BASE_URL || "/";
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    if (base !== "/") {
      if (url.pathname === base || url.pathname + "/" === base) {
        url.pathname = "/";
      } else if (url.pathname.startsWith(base)) {
        url.pathname = "/" + url.pathname.slice(base.length);
      } else {
        res.writeHead(404);
        res.end("outside base");
        return;
      }
    }
    if (req.method === "GET") {
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
    }
    const body =
      req.method === "POST"
        ? await new Promise<Buffer>((r) => {
            const chunks: Buffer[] = [];
            req.on("data", (c) => chunks.push(c));
            req.on("end", () => r(Buffer.concat(chunks)));
          })
        : undefined;
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === "string" && !k.startsWith(":")) headers[k] = v;
    }
    const response = await handler(
      new Request(url.href, { method: req.method, headers, body })
    );
    if (!response) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(
      response.status,
      Object.fromEntries(response.headers.entries())
    );
    const stream = response.body;
    if (!stream) return void res.end();
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      res.write(chunk);
    }
    res.end();
  });
}

describe.skipIf(!browserAvailable)(
  "webpack action round-trip through the baked gate",
  () => {
    let server: Server | undefined;

    beforeAll(async () => {
      await rm(testDir, { recursive: true, force: true });
      await setupFixture();
      const fr = fileRouter(join(testDir, "src/routes"), { root: testDir });
      await doBuild({
        projectRoot: testDir,
        moduleBase: "src",
        transport: "webpack",
        Page: fr.Page,
        props: fr.props,
        routePatterns: fr.routePatterns,
        build: {
          pages: fr.build.pages,
          outDir: "dist",
          edge: true,
        },
      } as any);

      // The DIRECTIVE-gated module must be in the baked allowlist even though
      // its name matches no `.server.` pattern — assert the bake itself before
      // the browser does.
      const render = readFileSync(
        join(testDir, "dist/server-edge/render.js"),
        "utf8"
      );
      expect(render).toContain('"src/ping.ts"');

      const bundle = await import(
        pathToFileURL(join(testDir, "dist/server-edge/render.js")).href
      );
      const consumer = await import(
        pathToFileURL(join(testDir, "dist/server-edge/consumer.js")).href
      );
      const { createEdgeRenderHook } = await import(
        "vite-plugin-react-server/edge"
      );
      const renderHook = createEdgeRenderHook(bundle, {
        renderFlightToHtml: consumer.renderFlightToHtml,
      });
      const { createRequestHandler } = await import(
        "vite-plugin-react-server/request-handler"
      );
      const app = createRequestHandler({
        staticDir: join(testDir, "dist/static"),
        render: renderHook,
        action: bundle.handleRouteAction,
      });
      server = serve(app as any, [
        join(testDir, "dist/static"),
        join(testDir, "dist/client"),
      ]);
      await new Promise<void>((r) => server!.listen(PORT, r));
    }, 180000);

    afterAll(async () => {
      await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
      if (!process.env.KEEP_FIXTURE)
        await rm(testDir, { recursive: true, force: true });
    });

    it("clicks through: encode, gate, execute, decode", async () => {
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        const pageErrors: string[] = [];
        const consoleErrors: string[] = [];
        page.on("pageerror", (e) => pageErrors.push(String(e)));
        page.on("console", (m) => {
          if (m.type() === "error") consoleErrors.push(m.text());
        });
        let actionStatus = 0;
        page.on("response", (r) => {
          if (r.request().method() === "POST") actionStatus = r.status();
        });

        await page.goto(
          `http://localhost:${PORT}${process.env.VITE_BASE_URL || "/"}`,
          { waitUntil: "networkidle" },
        );
        const button = page.locator("#ping");
        await button.waitFor({ timeout: 15000 });
        await page.waitForFunction(
          () => {
            const b = document.querySelector("#ping") as HTMLButtonElement;
            if (!b) return false;
            b.click();
            return b.textContent !== "ping";
          },
          undefined,
          { timeout: 20000, polling: 400 }
        );

        expect(await button.textContent()).toBe("doubled:42");
        expect(actionStatus).toBe(200);
        expect(pageErrors).toEqual([]);
        // The baked document's children arrays trip React's dev-only key
        // warning — pre-existing, cosmetic, unrelated to the action path.
        // Everything else (gate rejections, decode failures, hydration
        // errors) must stay fatal here.
        expect(
          consoleErrors.filter((e) => !/unique "key" prop/.test(e))
        ).toEqual([]);
      } finally {
        await browser.close();
      }
    });
  }
);
