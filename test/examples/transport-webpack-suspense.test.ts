import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm, writeFile, readFile, symlink } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { spawnSync } from "node:child_process";
import { resolve, join, extname } from "node:path";
import { chromium } from "playwright";
import {
  getCondition,
  REACT_CONDITION,
} from "../../plugin/config/getCondition.js";

// The Suspense artifact contract under transport:"webpack". The webpack SSG
// pass freezes snapshots THROUGH THE BAKED PAIR — a different render path
// than the esm prerender port — and before the consumer bundle carried a
// prerender export, a suspended route froze in the STREAMED shape: fallback
// in place, <template id="B:0">, hidden content, an inline $RC swap only
// JavaScript can perform. This pins the ported contract: the frozen file is
// the page (final markup at position), and it hydrates from a dumb static
// host with the webpack flight flavor end to end.
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

const testDir = resolve(__dirname, "../fixtures/transport-webpack-suspense.test");
const PORT = 4215;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".map": "application/json",
  // The dumb-host MIME on purpose — the fetcher's compatibility path must
  // stay exercised under the webpack flavor too.
  ".rsc": "application/octet-stream",
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
      `  await new Promise((r) => setTimeout(r, 30));\n` +
      `  return (\n` +
      `    <section data-resolved="yes">\n` +
      `      <Counter />\n` +
      `      {Array.from({ length: 300 }, (_, i) => (\n` +
      `        <p key={i}>resolved-row-{i}-padding-to-split-the-flush</p>\n` +
      `      ))}\n` +
      `    </section>\n` +
      `  );\n` +
      `}\n` +
      `export const Page = () => (\n` +
      `  <main id="app">\n` +
      `    <h1>{"webpack-suspense"}</h1>\n` +
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

function serveStatic(roots: string[]): Server {
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    let pathname = decodeURIComponent(url.pathname).replace(/\/{2,}/g, "/");
    if (pathname.endsWith("/")) pathname += "index.html";
    else if (!extname(pathname)) pathname += "/index.html";
    for (const root of roots) {
      const file = join(root, pathname);
      if (existsSync(file) && file.startsWith(root)) {
        res.writeHead(200, {
          "content-type": MIME[extname(file)] ?? "application/octet-stream",
        });
        res.end(readFileSync(file));
        return;
      }
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  });
}

describe.skipIf(!browserAvailable)(
  "transport webpack — the frozen suspended route carries final markup and hydrates",
  () => {
    let server: Server | undefined;
    let html = "";
    let rsc = "";

    beforeAll(async () => {
      await rm(testDir, { recursive: true, force: true });
      await setupFixture();

      // A deploy's build is a production build (see static-suspense-hydration
      // for the NODE_ENV rationale); the runner follows this leg's ambient
      // condition so test-both covers both topologies.
      const mainLeg = getCondition() === REACT_CONDITION.server;
      await writeFile(
        join(testDir, "build.mjs"),
        `import { createBuilder } from "vite";\n` +
          `import { vitePluginReactServer } from "vite-plugin-react-server";\n` +
          `import { fileRouter } from "vite-plugin-react-server/router";\n` +
          `const fr = fileRouter("src/routes", { root: process.cwd() });\n` +
          `const builder = await createBuilder({\n` +
          `  configFile: false,\n` +
          `  root: process.cwd(),\n` +
          `  mode: "production",\n` +
          `  esbuild: { jsx: "automatic" },\n` +
          `  plugins: vitePluginReactServer({\n` +
          `    runner: ${JSON.stringify(mainLeg ? "main" : "isolated")},\n` +
          `    transport: "webpack",\n` +
          `    moduleBase: "src",\n` +
          `    Page: fr.Page,\n` +
          `    props: fr.props,\n` +
          `    routePatterns: fr.routePatterns,\n` +
          `    build: { pages: fr.build.pages, outDir: "dist" },\n` +
          `    moduleBasePath: "",\n` +
          `    moduleBaseURL: "/",\n` +
          `    projectRoot: process.cwd(),\n` +
          `  }),\n` +
          `});\n` +
          `await builder.buildApp();\n` +
          `console.log("WEBPACK_SUSPENSE_BUILD_OK");\n` +
          `process.exit(0);\n`
      );
      const env = { ...process.env, NODE_ENV: "production" };
      env["NODE_OPTIONS"] = mainLeg ? "--conditions react-server" : "";
      const proc = spawnSync("node", ["build.mjs"], {
        cwd: testDir,
        encoding: "utf8",
        timeout: 180000,
        env,
      });
      expect(
        proc.stdout,
        `build failed (status ${proc.status}):\n${proc.stderr}`
      ).toContain("WEBPACK_SUSPENSE_BUILD_OK");

      html = await readFile(join(testDir, "dist/static/index.html"), "utf8");
      rsc = await readFile(join(testDir, "dist/static/index.rsc"), "utf8");
      server = serveStatic([
        join(testDir, "dist/static"),
        join(testDir, "dist/client"),
      ]);
      await new Promise<void>((r) => server!.listen(PORT, r));
    }, 240000);

    afterAll(async () => {
      await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
      if (!process.env["KEEP_FIXTURE"])
        await rm(testDir, { recursive: true, force: true });
    });

    it("the frozen document carries the RESOLVED content in the webpack flavor", () => {
      expect(html).toContain('data-resolved="yes"');
      expect(html).toContain("padding-to-split-the-flush");
      // The flavor is observable in the sibling flight snapshot: webpack
      // reference rows carry a chunk array; esm rows are bare module paths.
      expect(rsc).toMatch(/I\["[^"]+",\[/);
    });

    it("the frozen HTML IS the page: no swap scripts, content at position", () => {
      expect(html).not.toContain("$RC");
      expect(html).not.toContain("<template");
      expect(html).not.toContain("div hidden");
      expect(html).not.toContain('id="fallback"');
      const h1 = html.indexOf("</h1>");
      expect(html.slice(h1, h1 + 120)).toContain('data-resolved="yes"');
    });

    it("hydrates from the dumb host: the boundary stays resolved and answers a click", async () => {
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        const pageErrors: string[] = [];
        page.on("pageerror", (e) => pageErrors.push(String(e)));
        await page.goto(`http://localhost:${PORT}/`, {
          waitUntil: "networkidle",
        });
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
        expect(await page.locator("[data-resolved='yes']").count()).toBe(1);
        expect(await page.locator("#fallback").count()).toBe(0);
        expect(
          pageErrors.filter((e) => e.includes("Minified React error #419"))
        ).toEqual([]);
      } finally {
        await browser.close();
      }
    });
  }
);
