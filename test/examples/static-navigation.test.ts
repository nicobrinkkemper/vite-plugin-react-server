import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { resolve, join, extname } from "node:path";
import { chromium } from "playwright";
import { doBuild } from "../doBuild.js";
import { fileRouter } from "../../plugin/router/fileRouter.js";

// Client-side navigation against an ORDINARY static file server — the proof
// that vprs's per-route artifact pair (index.html + index.rsc) needs no
// negotiating host. Vike ships .pageContext.json companion files because its
// browser re-requests the same URL with Accept headers a dumb host cannot
// answer; vprs's contract is the opposite and this pins it: navigating to a
// prerendered route fetches the target's index.rsc EXACTLY ONCE (one .rsc GET
// is the invariant — zero would mean a full reload, more would be waste), no
// target HTML document is requested, the SPA session survives
// (performance.timeOrigin unchanged), and the target page is interactive.
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

const testDir = resolve(__dirname, "../fixtures/static-navigation.test");
const PORT = 4197;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".map": "application/json",
  // A host that has never heard of .rsc serves it like this — the fixtures
  // must NOT flatter the deploy target with the correct flight MIME, or the
  // fetcher's dumb-host compatibility path goes unexercised.
  ".rsc": "application/octet-stream",
};

async function setupFixture() {
  await mkdir(join(testDir, "src/routes/about"), { recursive: true });
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
  // First-party client wrapper for the router barrel: the fixture symlinks
  // the repo's node_modules, so vprs sits outside the project root and the
  // barrel's client references can't be hosted directly (the loud
  // hoisted-barrel guard). Real hoisted/monorepo consumers do the same.
  await writeFile(
    join(testDir, "src/routes/NavLink.client.tsx"),
    `"use client";\n` +
      `export { Link } from "vite-plugin-react-server/router/client";\n`
  );
  await writeFile(
    join(testDir, "src/routes/page.tsx"),
    `import * as React from "react";\n` +
      `import { Link } from "./NavLink.client.js";\n` +
      `import { Counter } from "./Counter.client.js";\n` +
      `export const Page = () => (\n` +
      `  <main>\n` +
      `    <h1 id="heading">{"home"}</h1>\n` +
      `    <Counter id="home-counter" />\n` +
      `    <Link id="to-about" to="/about/">{"go to about"}</Link>\n` +
      `    <Link id="to-void" to="/void/">{"go nowhere"}</Link>\n` +
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

/** Files in, bytes out. No handler, no Accept negotiation, no rewrites. */
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
  "static-host navigation — one .rsc GET, no document re-request, session survives",
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
        build: { pages: fr.build.pages, outDir: "dist" },
      } as never);

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

    it("navigates through the artifact pair without help from the host", async () => {
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        const pageErrors: string[] = [];
        const consoleErrors: string[] = [];
        const rscRequests: string[] = [];
        const documentRequests: string[] = [];
        page.on("pageerror", (e) => pageErrors.push(String(e)));
        page.on("console", (m) => {
          if (m.type() === "error") consoleErrors.push(m.text());
        });
        page.on("request", (r) => {
          const url = new URL(r.url());
          if (url.pathname.endsWith(".rsc")) rscRequests.push(url.pathname);
          if (r.resourceType() === "document")
            documentRequests.push(url.pathname);
        });

        await page.goto(`http://localhost:${PORT}/`, {
          waitUntil: "networkidle",
        });
        expect(await page.locator("#heading").textContent()).toBe("home");

        // Hydration gate: an unhydrated <Link> click is a full browser
        // navigation — a legitimate FAILURE of everything below — so first
        // prove hydration via the home counter (poll clicks until one lands).
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
          { timeout: 20000, polling: 400 }
        );

        const timeOriginBefore = await page.evaluate(
          () => performance.timeOrigin
        );

        await page.click("#to-about");
        await page.waitForFunction(
          () => document.querySelector("#heading")?.textContent === "about",
          undefined,
          { timeout: 15000 }
        );

        // The SPA session survived: same timeOrigin means no full reload.
        expect(await page.evaluate(() => performance.timeOrigin)).toBe(
          timeOriginBefore
        );

        // The transport contract: the target's flight artifact was fetched
        // exactly once, and no HTML document was requested after the initial
        // load — the dumb host never had to tell content from payload apart.
        expect(
          rscRequests.filter((p) => p.includes("about"))
        ).toHaveLength(1);
        expect(documentRequests).toEqual(["/"]);

        // The navigated-to page is interactive (its client component mounts
        // from the flight payload, not from a document).
        const about = page.locator("#about-counter");
        await about.waitFor({ timeout: 10000 });
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
          { timeout: 20000, polling: 400 }
        );
        expect(await about.textContent()).toMatch(/^count:[1-9]/);

        expect(pageErrors).toEqual([]);
        expect(
          consoleErrors.filter((e) => /#4(18|19|23|25)|hydrat/i.test(e))
        ).toEqual([]);
      } finally {
        await browser.close();
      }
    });

    it("falls back to a FULL navigation when the host answers a miss with text", async () => {
      // The negative half of the decode gate: this dumb host has no 404
      // flight — a missing route's .rsc fetch gets a text/plain 404. That
      // must never reach the decoder; the router performs a full document
      // navigation instead, so the host's real response is what shows.
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        const documentRequests: string[] = [];
        page.on("request", (r) => {
          if (r.resourceType() === "document")
            documentRequests.push(new URL(r.url()).pathname);
        });

        await page.goto(`http://localhost:${PORT}/`, {
          waitUntil: "networkidle",
        });
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
          { timeout: 20000, polling: 400 }
        );

        await page.click("#to-void");
        // Full document load of the target: the address moves AND the host's
        // plain 404 body is what renders — no decoder involvement.
        await page.waitForURL(/\/void\/?$/, { timeout: 15000 });
        await page.waitForFunction(
          () => document.body.textContent?.includes("not found"),
          undefined,
          { timeout: 10000 }
        );
        expect(documentRequests).toContain("/void/");
      } finally {
        await browser.close();
      }
    });
  }
);
