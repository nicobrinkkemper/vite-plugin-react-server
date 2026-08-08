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

/**
 * Regression for the moduleBaseURL + id join contract (bd-fnmz).
 *
 * The stock esm transport concatenates `moduleBaseURL + id`. With rooted ids
 * and a trailing-slash base that produced "//…" URLs — same bytes, different
 * module identity, two React copies, hooks crash. createReactFetcher strips
 * the base's trailing slash; createDefaultModuleID roots client ids. This
 * fixture uses moduleBaseURL "/" on purpose: it must hydrate.
 *
 * Blob-mode inline flight (available on main); the stream-mode twin lives on
 * the inlineFlight "stream" PR and flips the same way once that lands.
 */
const createEdgeHandler = (streamApi as { createEdgeHandler?: unknown })
  .createEdgeHandler;

const browserAvailable = (() => {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
})();

const testDir = resolve(__dirname, "../fixtures/edge-join-hydration.test");
const PORT = 4188;

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
      `    <h1>{"join-hydration"}</h1>\n` +
      `    <Counter />\n` +
      `  </div>\n` +
      `);\n`
  );
  // moduleBaseURL "/" is the REGRESSION CASE: without the join contract the
  // transport composed "//routes/…" and hooks crashed on a null dispatcher.
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

/**
 * Minimal Node bridge: edge fetch handler first, static files second.
 * Deliberately does NOT collapse "//" in the pathname — production hosts that
 * 301-normalize mask the bug; this fixture must surface a broken join.
 */
function serve(
  edgeHandler: (req: Request) => Promise<Response>,
  staticRoots: string[]
): Server {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
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
  "edge join contract — moduleBaseURL '/' hydrates (bd-fnmz)",
  () => {
    let server: Server | undefined;

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
          inlineFlight: true,
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
    }, 180000);

    afterAll(async () => {
      await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
      if (!process.env.KEEP_FIXTURE)
        await rm(testDir, { recursive: true, force: true });
    });

    it("hydrates under moduleBaseURL '/': interactive, error-free", async () => {
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        const pageErrors: string[] = [];
        const consoleErrors: string[] = [];
        page.on("pageerror", (e) => pageErrors.push(String(e)));
        page.on("console", (m) => {
          if (m.type() === "error") consoleErrors.push(m.text());
        });

        await page.goto(`http://localhost:${PORT}/`, {
          waitUntil: "networkidle",
        });

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

        expect(pageErrors).toEqual([]);
        expect(
          consoleErrors.filter((e) => /#4(18|23|25)|hydrat|useState/i.test(e))
        ).toEqual([]);
      } finally {
        await browser.close();
      }
    });
  }
);
