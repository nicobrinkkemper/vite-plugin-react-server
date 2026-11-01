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

// `inlineFlight: "stream"` on a document longer than one of React's output
// views. The edge renderer packs HTML into 4096-byte views and ends a view on
// whatever byte comes next; with a tag-dense page nearly every view ends
// inside a tag. A flight chunk pending at such a boundary was once written
// right there, as attribute text that never ran, and the browser failed
// hydration with React #412 ("Connection closed": the rows never arrived).
// This is vprs-starter's per-request "/" on 4.4.0, rebuilt small: the edge
// runner, a client component, and a body several views long (the transport
// plays no part; the stock esm one is used). The wire must carry every chunk
// script as an element and the page must hydrate from them without an error
// or an index.rsc fetch.
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

const testDir = resolve(__dirname, "../fixtures/edge-stream-split-views.test");
const PORT = 4191;
const CELLS = 600; // ~45 KB of markup: ten view boundaries, almost all inside a tag
// Two places the tokenizer must read as content, not as a tag end: script
// data in the double-escaped state, and a CDATA section in foreign content
// (the browser serializes the parsed CDATA as escaped text, which React's dev
// hydration would report as an innerHTML mismatch; that warning is unrelated
// and suppressed on the element).
const INLINE_SCRIPT = 'globalThis.sample="<!--<script></script>";';
const CDATA = "<![CDATA[a > </svg> b]]>";

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
      `const cells = Array.from({ length: ${CELLS} }, (_, i) => (\n` +
      `  <span key={i} className="cell cell-grid-item" data-index={i} data-label={"cell-" + i} />\n` +
      `));\n` +
      `export const Page = () => (\n` +
      `  <div id="app">\n` +
      `    <h1>{"split-views"}</h1>\n` +
      `    <Counter />\n` +
      `    <script dangerouslySetInnerHTML={{ __html: ${JSON.stringify(INLINE_SCRIPT)} }} />\n` +
      `    <svg width="1" height="1" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: ${JSON.stringify(CDATA)} }} />\n` +
      `    <div id="grid">{cells}</div>\n` +
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

const CHUNK_SCRIPT = `<script>(self.${INLINE_FLIGHT_STREAM_GLOBAL}||=[]).push(`;

describe.skipIf(!createEdgeHandler || !browserAvailable)(
  "edge stream mode — a document longer than one renderer view",
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
    }, 180000);

    afterAll(async () => {
      await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
      if (!process.env.KEEP_FIXTURE)
        await rm(testDir, { recursive: true, force: true });
    });

    it("every chunk script on the wire is an element between tags, not text inside one", () => {
      // The condition under test: the document spans several views.
      expect(rawHtml.length).toBeGreaterThan(4096 * 4);
      expect(rawHtml).toContain(CHUNK_SCRIPT);
      let at = -1;
      while ((at = rawHtml.indexOf(CHUNK_SCRIPT, at + 1)) !== -1) {
        const before = rawHtml.slice(0, at);
        // An unclosed "<" before the script means it sits inside a tag.
        expect(before.lastIndexOf("<")).toBeLessThan(before.lastIndexOf(">"));
        expect(before.endsWith(">")).toBe(true);
      }
      expect(rawHtml).toContain(".push(null)");
      expect(rawHtml.trimEnd().endsWith("</html>")).toBe(true);
      // Nothing was written into the inline script's string or the CDATA.
      expect(rawHtml).toContain(`<script>${INLINE_SCRIPT}</script>`);
      expect(rawHtml).toContain(`${CDATA}</svg>`);
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

        // Hydration proof: the client component answers a click.
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
        expect(await page.locator("#grid .cell").count()).toBe(CELLS);
        // The inline script ran whole, and the CDATA stayed one text node.
        expect(await page.evaluate(() => (globalThis as any).sample)).toBe(
          '<!--<script></script>'
        );
        expect(await page.locator("svg").textContent()).toBe("a > </svg> b");

        // No lost payload (#412 "Connection closed"), no hydration mismatch
        // (#418/#423/#425) and no error of any kind.
        expect(pageErrors).toEqual([]);
        expect(
          consoleErrors.filter((e) =>
            /#4(12|18|23|25)|hydrat|Connection closed/i.test(e)
          )
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
