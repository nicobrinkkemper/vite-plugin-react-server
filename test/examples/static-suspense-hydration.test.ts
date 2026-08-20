import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm, writeFile, symlink, readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { resolve, join, extname } from "node:path";
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import {
  getCondition,
  REACT_CONDITION,
} from "../../plugin/config/getCondition.js";

// A DELAYED Suspense boundary, prerendered, served from a DUMB file server,
// hydrated in a real browser — the failure this pins is a completed static
// HTML file that still carries an unfinished Suspense representation, which
// React discards during hydration (error #419 / the boundary snapping back to
// its fallback). The html-backpressure regression proves delayed content
// reaches the OUTPUT; this proves the output HYDRATES. The server here is
// deliberately stupid: files in, bytes out, no render path, no negotiation —
// exactly what a static deploy (CDN, GitHub Pages) provides.
const browserAvailable = (() => {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
})();
// Fail CLOSED where a browser is guaranteed (the CI browser-regressions job
// sets this): a missing Chromium must fail the job, never skip it green.
// Local runs without a browser still skip. Same discipline as
// VPRS_REQUIRE_MINIFLARE in the workerd smoke.
if (!browserAvailable && process.env["VPRS_REQUIRE_BROWSER"]) {
  throw new Error(
    "VPRS_REQUIRE_BROWSER is set but Playwright Chromium is not installed"
  );
}


const testDir = resolve(__dirname, "../fixtures/static-suspense-hydration.test");
const PORT = 4193;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".map": "application/json",
  ".rsc": "text/x-component; charset=utf-8",
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
  // The interactive client component lives INSIDE the suspended subtree, so
  // hydration success is provable exactly where the discarded-boundary
  // failure would bite. The resolved tree is bulky enough to force the
  // prerender into a fallback flush + a content flush.
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
      `    <h1>{"static-suspense"}</h1>\n` +
      `    <Suspense fallback={<div id="fallback">{"loading"}</div>}>\n` +
      `      <Delayed />\n` +
      `    </Suspense>\n` +
      `  </main>\n` +
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

/**
 * The dumb file server: dist/static then dist/client, extension-less paths
 * get index.html, unknown paths get 404. No handler, no Accept negotiation.
 */
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
  "static Suspense — prerendered boundary hydrates from a dumb file server",
  () => {
    let server: Server | undefined;
    let html = "";

    beforeAll(async () => {
      await rm(testDir, { recursive: true, force: true });
      await setupFixture();

      // Build in a SPAWNED process with NODE_ENV=production, like the
      // html-backpressure regression: a deploy's build is a production build,
      // and vitest's ambient NODE_ENV=test would silently swap the vendored
      // transport to its dev variant — a different pipeline than any deploy
      // runs (and one with its own, separately tracked, suspended-flight
      // stall in the isolated topology). The runner follows this leg's
      // ambient condition, so test-both still covers both topologies.
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
          `console.log("SUSPENSE_BUILD_OK");\n` +
          `process.exit(0);\n`
      );
      const env = { ...process.env, NODE_ENV: "production" };
      env["NODE_OPTIONS"] = mainLeg ? "--conditions react-server" : "";
      const proc = spawnSync("node", ["build.mjs"], {
        cwd: testDir,
        encoding: "utf8",
        timeout: 120000,
        env,
      });
      expect(
        proc.stdout,
        `build failed (status ${proc.status}):\n${proc.stderr}`
      ).toContain("SUSPENSE_BUILD_OK");

      html = await readFile(join(testDir, "dist/static/index.html"), "utf8");
      server = serveStatic([
        join(testDir, "dist/static"),
        join(testDir, "dist/client"),
      ]);
      await new Promise<void>((r) => server!.listen(PORT, r));
    }, 180000);

    afterAll(async () => {
      await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
      if (!process.env["KEEP_FIXTURE"])
        await rm(testDir, { recursive: true, force: true });
    });

    it("the prerendered document carries the RESOLVED content, not the fallback", () => {
      expect(html).toContain('data-resolved="yes"');
      expect(html).toContain("padding-to-split-the-flush");
    });

    it("the prerendered HTML IS the page: no swap scripts, content at position", () => {
      // The static artifact contract (react-dom/static prerender): a suspended
      // boundary's resolved markup sits AT its position — never the streamed
      // shape of fallback-in-place + hidden content + an inline $RC swap that
      // only JavaScript can perform. This is what makes the file correct under
      // no-JS and inline-script-blocking CSP.
      expect(html).not.toContain("$RC");
      expect(html).not.toContain("<template");
      expect(html).not.toContain("div hidden");
      // Resolved content precedes where the fallback would have been; the
      // fallback markup is absent entirely.
      expect(html).not.toContain('id="fallback"');
      const h1 = html.indexOf("</h1>");
      expect(html.slice(h1, h1 + 120)).toContain('data-resolved="yes"');
    });

    it("hydrates without #419: the boundary stays resolved and answers a click", async () => {
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

        // Hydration proof INSIDE the boundary: poll clicks until one lands
        // (the first observed increment is the hydration-complete signal).
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

        // The boundary must never have snapped back to its fallback — that
        // is #419's visible half (React discarding the unfinished server
        // representation and client-rendering the fallback first).
        expect(await page.locator('[data-resolved="yes"]').count()).toBe(1);
        expect(await page.locator("#fallback").count()).toBe(0);

        // The invisible half: no hydration errors of any flavor.
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
