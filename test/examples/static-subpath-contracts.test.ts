import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { spawnSync } from "node:child_process";
import { resolve, join, extname } from "node:path";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import {
  getCondition,
  REACT_CONDITION,
} from "../../plugin/config/getCondition.js";

// The subpath-deploy leg for the 4.0 static contracts, per the standing
// lesson that dev+root+single-load gives false passes. One GH-Pages-style
// build (base "/app/") pins, under the base, everything the root-based
// suites pin at "/":
//   - the prerendered suspended artifact carries final markup and HYDRATES
//     (a client component inside the boundary answers clicks);
//   - client navigation is exactly ONE .rsc GET against the BASED url, no
//     document re-request, session survives;
//   - a navigation miss answered with the 404 route's flight (the #394
//     outcome, as a based host serves it) swaps the 404 view in without
//     leaving the SPA.
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

const testDir = resolve(__dirname, "../fixtures/static-subpath-contracts.test");
const PORT = 4219;
const BASE = "/app/";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".map": "application/json",
  ".rsc": "application/octet-stream",
};

async function setupFixture() {
  await mkdir(join(testDir, "src/routes/about"), { recursive: true });
  await mkdir(join(testDir, "src/routes/404"), { recursive: true });
  await writeFile(
    join(testDir, "src/routes/Counter.client.tsx"),
    `"use client";\n` +
      `import * as React from "react";\n` +
      `export function Counter({ id }: { id: string }) {\n` +
      `  const [n, setN] = React.useState(0);\n` +
      `  return (\n` +
      `    <button id={id} onClick={() => setN((v) => v + 1)}>\n` +
      `      {"count:" + n}\n` +
      `    </button>\n` +
      `  );\n` +
      `}\n`
  );
  await writeFile(
    join(testDir, "src/routes/NavLink.client.tsx"),
    `"use client";\n` +
      `export { Link } from "vite-plugin-react-server/router/client";\n`
  );
  // The home page carries a suspended boundary WITH the interactive client
  // component inside it, so the based artifact contract and based hydration
  // are proven at the same spot the root-based suite proves them.
  await writeFile(
    join(testDir, "src/routes/page.tsx"),
    `import * as React from "react";\n` +
      `import { Suspense } from "react";\n` +
      `import { Link } from "./NavLink.client.js";\n` +
      `import { Counter } from "./Counter.client.js";\n` +
      `async function Delayed() {\n` +
      `  await new Promise((r) => setTimeout(r, 30));\n` +
      `  return (\n` +
      `    <section data-resolved="yes">\n` +
      `      <Counter id="home-counter" />\n` +
      `      {Array.from({ length: 300 }, (_, i) => (\n` +
      `        <p key={i}>resolved-row-{i}-padding-to-split-the-flush</p>\n` +
      `      ))}\n` +
      `    </section>\n` +
      `  );\n` +
      `}\n` +
      `export const Page = () => (\n` +
      `  <main>\n` +
      `    <h1 id="heading">{"home"}</h1>\n` +
      `    <Link id="to-about" to="/about/">{"go to about"}</Link>\n` +
      `    <Link id="to-void" to="/void/">{"go nowhere"}</Link>\n` +
      `    <Suspense fallback={<div id="fallback">{"loading"}</div>}>\n` +
      `      <Delayed />\n` +
      `    </Suspense>\n` +
      `  </main>\n` +
      `);\n`
  );
  await writeFile(
    join(testDir, "src/routes/about/page.tsx"),
    `import * as React from "react";\n` +
      `import { Counter } from "../Counter.client.js";\n` +
      `export const Page = () => (\n` +
      `  <main>\n` +
      `    <h1 id="heading">{"about"}</h1>\n` +
      `    <Counter id="about-counter" />\n` +
      `  </main>\n` +
      `);\n`
  );
  await writeFile(
    join(testDir, "src/routes/404/page.tsx"),
    `import * as React from "react";\n` +
      `export const Page = () => <h1 id="heading">{"not-found-page"}</h1>;\n`
  );
  await writeFile(
    join(testDir, "src/client.tsx"),
    `"use client";\n` +
      `import { startClient } from "vite-plugin-react-server/router/client";\n` +
      `startClient({ moduleBaseURL: ${JSON.stringify(BASE)} });\n`
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
 * A GH-Pages-style host: everything lives UNDER the base. Requests outside
 * the base 404; a flight request that misses is answered with the
 * prerendered 404 route's flight and the not-found outcome header (what a
 * vprs-aware based host — createRequestHandler behind a base-stripping
 * mount — serves per the #394 contract).
 */
function serveBased(roots: string[]): Server {
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    let pathname = decodeURIComponent(url.pathname).replace(/\/{2,}/g, "/");
    if (!pathname.startsWith(BASE)) {
      res.writeHead(404, { "content-type": "text/plain" });
      return void res.end("outside base");
    }
    pathname = pathname.slice(BASE.length - 1); // keep the leading slash
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
    if (pathname.endsWith(".rsc")) {
      const notFoundFlight = join(roots[0]!, "404/index.rsc");
      if (existsSync(notFoundFlight)) {
        res.writeHead(404, {
          "content-type": "text/x-component; charset=utf-8",
          "x-vprs-outcome": "not-found",
        });
        return void res.end(readFileSync(notFoundFlight));
      }
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  });
}

describe.skipIf(!browserAvailable)(
  "subpath deploy — the static contracts hold under a GH-Pages-style base",
  () => {
    let server: Server | undefined;
    let html = "";

    beforeAll(async () => {
      await rm(testDir, { recursive: true, force: true });
      await setupFixture();

      // Spawned production build (see static-suspense-hydration for the
      // NODE_ENV rationale); the runner follows this leg's condition.
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
          `  base: ${JSON.stringify(BASE)},\n` +
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
          `    moduleBaseURL: ${JSON.stringify(BASE)},\n` +
          `    projectRoot: process.cwd(),\n` +
          `  }),\n` +
          `});\n` +
          `await builder.buildApp();\n` +
          `console.log("SUBPATH_BUILD_OK");\n` +
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
      ).toContain("SUBPATH_BUILD_OK");

      html = await readFile(join(testDir, "dist/static/index.html"), "utf8");
      server = serveBased([
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

    it("the based artifact keeps the static contract: final markup, based asset urls", () => {
      expect(html).toContain('data-resolved="yes"');
      expect(html).not.toContain("$RC");
      expect(html).not.toContain("<template");
      expect(html).not.toContain('id="fallback"');
      // Everything the document references is under the base.
      expect(html).toContain(`src="${BASE}`);
    });

    it("hydrates, navigates with ONE based .rsc GET, and shows the 404 flight on a miss", async () => {
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        const pageErrors: string[] = [];
        const rscRequests: string[] = [];
        const documentRequests: string[] = [];
        page.on("pageerror", (e) => pageErrors.push(String(e)));
        page.on("request", (r) => {
          if (r.url().includes(".rsc")) rscRequests.push(r.url());
          if (r.resourceType() === "document") documentRequests.push(r.url());
        });

        await page.goto(`http://localhost:${PORT}${BASE}`, {
          waitUntil: "networkidle",
        });

        // Hydration gate under the base: a client component INSIDE the
        // prerendered suspended boundary answers clicks.
        await page.waitForFunction(
          () => {
            const b = document.querySelector(
              "#home-counter"
            ) as HTMLButtonElement;
            if (!b) return false;
            b.click();
            return b.textContent !== "count:0";
          },
          undefined,
          { timeout: 20000, polling: 300 }
        );
        const documentBaseline = documentRequests.length;
        const timeOrigin = await page.evaluate(() => performance.timeOrigin);
        const rscBaseline = rscRequests.length;

        // Client navigation: exactly one .rsc GET, against the BASED url.
        await page.click("#to-about");
        await page.waitForFunction(
          () => document.querySelector("#heading")?.textContent === "about",
          undefined,
          { timeout: 15000, polling: 300 }
        );
        const navRequests = rscRequests.slice(rscBaseline);
        expect(navRequests).toEqual([
          `http://localhost:${PORT}${BASE}about/index.rsc`,
        ]);
        expect(new URL(page.url()).pathname).toBe(`${BASE}about/`);

        // Interactive after the based navigation.
        await page.waitForFunction(
          () => {
            const b = document.querySelector(
              "#about-counter"
            ) as HTMLButtonElement;
            if (!b) return false;
            b.click();
            return b.textContent !== "count:0";
          },
          undefined,
          { timeout: 15000, polling: 300 }
        );

        // Back home (cached flight), then a MISS: the based host answers the
        // 404 route's flight with the not-found outcome — the SPA shows it
        // without a document load.
        await page.goBack();
        await page.waitForFunction(
          () => document.querySelector("#heading")?.textContent === "home",
          undefined,
          { timeout: 15000, polling: 300 }
        );
        await page.click("#to-void");
        await page.waitForFunction(
          () =>
            document.querySelector("#heading")?.textContent ===
            "not-found-page",
          undefined,
          { timeout: 15000, polling: 300 }
        );

        expect(await page.evaluate(() => performance.timeOrigin)).toBe(
          timeOrigin
        );
        expect(documentRequests.length).toBe(documentBaseline);
        expect(pageErrors).toEqual([]);
      } finally {
        await browser.close();
      }
    });
  }
);
