import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import {
  getCondition,
  REACT_CONDITION,
} from "../../plugin/config/getCondition.js";

// Dev error recovery, the full editor loop in a real browser: break a server
// component (runtime reference error), then FIX it — the page must recover
// WITHOUT a manual refresh. Historically the error rode the flight, threw
// uncaught in the client render, and React unmounted the entire tree — HMR
// hooks included — so the fix had nothing listening and only a reload
// helped. The dev recovery boundary keeps the root alive and shows the error
// in place; a transform error (broken syntax) keeps the CURRENT view instead
// (the refetch rejection is retained, Vite reports the compile error), and
// the next update retries.
const browserAvailable = (() => {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
})();
// Fail CLOSED where a browser is guaranteed (the CI browser-regressions job
// sets this): a missing Chromium must fail the job, never skip it green.
if (!browserAvailable && process.env["VPRS_REQUIRE_BROWSER"]) {
  throw new Error(
    "VPRS_REQUIRE_BROWSER is set but Playwright Chromium is not installed"
  );
}

const testDir = resolve(__dirname, "../fixtures/dev-error-recovery.test");
const PAGE = join(testDir, "src/page/page.tsx");
const PORT = 4207;

const goodPage = (v: number) =>
  `import * as React from "react";\n` +
  `import { Counter } from "./Counter.client.js";\n` +
  `export const Page = () => (\n` +
  `  <main>\n` +
  `    <h1 id="heading">version-${v}</h1>\n` +
  `    <Counter />\n` +
  `  </main>\n` +
  `);\n`;
const brokenRuntimePage =
  `import * as React from "react";\n` +
  `import { Counter } from "./Counter.client.js";\n` +
  `export const Page = () => (\n` +
  `  <main>\n` +
  `    <h1 id="heading">{missingVariable}</h1>\n` +
  `    <Counter />\n` +
  `  </main>\n` +
  `);\n`;
const brokenSyntaxPage =
  `import * as React from "react";\n` +
  `export const Page = () => (<main><h1 id="heading">{oops</h1></main>);\n`;

async function setupFixture() {
  await rm(testDir, { recursive: true, force: true });
  await mkdir(join(testDir, "src/page"), { recursive: true });
  await writeFile(PAGE, goodPage(1));
  await writeFile(
    join(testDir, "src/page/Counter.client.tsx"),
    `"use client";\n` +
      `import * as React from "react";\n` +
      `export function Counter() {\n` +
      `  const [n, setN] = React.useState(0);\n` +
      `  return <button id="counter" onClick={() => setN((v) => v + 1)}>{"count:" + n}</button>;\n` +
      `}\n`
  );
  await writeFile(join(testDir, "src/page/props.ts"), `export const props = () => ({});\n`);
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

describe.skipIf(!browserAvailable)("dev error recovery (edit → break → fix)", () => {
  let server: ViteDevServer;
  let browser: Browser;
  let page: Page;
  let port: number;
  const documentRequests: string[] = [];
  let documentBaseline = 0;

  const heading = async () => {
    try {
      return await page.locator("#heading").textContent({ timeout: 2000 });
    } catch {
      return "<none>";
    }
  };
  const errorPanelVisible = async () =>
    (await page.locator("[data-vprs-dev-error]").count()) > 0;
  const waitFor = (fn: () => Promise<boolean>, ms = 15000) =>
    new Promise<void>((res, rej) => {
      const start = Date.now();
      const tick = async () => {
        if (await fn()) return res();
        if (Date.now() - start > ms) return rej(new Error("waitFor timeout"));
        setTimeout(tick, 300);
      };
      void tick();
    });

  beforeAll(async () => {
    await setupFixture();
    const mainLeg = getCondition() === REACT_CONDITION.server;
    server = await createServer({
      mode: "test",
      root: testDir,
      esbuild: { jsx: "automatic" },
      // The dep-optimizer cache lives under the SYMLINKED node_modules and is
      // shared across fixtures — a stale pre-bundled router client silently
      // tests the previous build. Isolate and force.
      cacheDir: ".vite-recovery-test",
      optimizeDeps: { force: true },
      plugins: [
        vitePluginReactServer({
          runner: mainLeg ? "main" : "isolated",
          moduleBase: "src",
          Page: () => "src/page/page.tsx",
          props: () => "src/page/props.ts",
          moduleBasePath: "",
          moduleBaseURL: "/",
          projectRoot: testDir,
        }),
      ],
      server: { port: PORT },
    });
    await server.listen();
    port = server.config.server.port ?? PORT;

    browser = await chromium.launch();
    page = await browser.newPage();
    page.on("request", (r) => {
      if (r.resourceType() === "document") documentRequests.push(r.url());
    });
    await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });
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
    // Startup settles before the baseline: a LINKED plugin is excluded from
    // the dep optimizer (never-stale dist), so its inner deps are discovered
    // on first load and one cold-cache re-optimize reload can land during
    // startup. The contract under test is the break/fix cycle — measured
    // against this baseline, not against startup noise.
    await new Promise((r) => setTimeout(r, 1500));
    documentBaseline = documentRequests.length;
  }, 120000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (!process.env["KEEP_FIXTURE"])
      await rm(testDir, { recursive: true, force: true });
  });

  it("a HEALTHY server edit preserves client-component state", async () => {
    // The state-preserving HMR contract: the recovery boundary must never
    // remount the subtree on a healthy update (an unconditional key remount
    // did, wiping client state on every delivered flight).
    expect(await heading()).toBe("version-1");
    // Click up to a known count on top of whatever the hydration gate left.
    await page.click("#counter");
    await page.click("#counter");
    const before = await page.locator("#counter").textContent();

    await writeFile(PAGE, goodPage(1.5));
    await waitFor(async () => (await heading()) === "version-1.5");
    expect(await page.locator("#counter").textContent()).toBe(before);

    await writeFile(PAGE, goodPage(1));
    await waitFor(async () => (await heading()) === "version-1");
    expect(await page.locator("#counter").textContent()).toBe(before);
  }, 60000);

  it("a runtime break shows the error in place, and the fix recovers without a refresh", async () => {
    expect(await heading()).toBe("version-1");
    const timeOrigin = await page.evaluate(() => performance.timeOrigin);

    await writeFile(PAGE, brokenRuntimePage);
    // The old failure mode was a BLANK page (whole tree unmounted). The
    // boundary must show the error instead.
    await waitFor(errorPanelVisible);

    await writeFile(PAGE, goodPage(2));
    // Watcher -> worker re-render -> update event -> refetch: under CI load
    // this transition alone exceeded the 15s default (by 211ms) while the
    // test budget sat at 60s. Give the wait the budget it actually has.
    await waitFor(async () => (await heading()) === "version-2", 45000);
    expect(await errorPanelVisible()).toBe(false);

    // Same session, no document reload DURING the cycle: the recovery
    // happened in place.
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
    expect(documentRequests.length).toBe(documentBaseline);
  }, 60000);

  it("a syntax break keeps the current view, and the fix updates it", async () => {
    // Self-established baseline: without this the case starts from wherever
    // the previous test left the fixture, and a flake there cascades here as
    // a second, misleading failure.
    await writeFile(PAGE, goodPage(2));
    await waitFor(async () => (await heading()) === "version-2", 45000);
    await writeFile(PAGE, brokenSyntaxPage);
    // The refetch rejects (transform error → non-flight answer); the view is
    // RETAINED — never blanked, never navigated.
    await new Promise((r) => setTimeout(r, 2000));
    expect(await heading()).toBe("version-2");

    await writeFile(PAGE, goodPage(3));
    await waitFor(async () => (await heading()) === "version-3");
    expect(documentRequests.length).toBe(documentBaseline);

    // The client component inside the recovered tree still answers clicks.
    await page.waitForFunction(
      () => {
        const b = document.querySelector("#counter") as HTMLButtonElement;
        if (!b) return false;
        b.click();
        return parseInt((b.textContent || "").replace("count:", ""), 10) > 0;
      },
      undefined,
      { timeout: 10000, polling: 300 }
    );
  }, 60000);
});
