/**
 * Regression coverage for bd-5rk (2026-05-13):
 *
 *   Reported: editing a *.module.css file in `dev:ssr` mode breaks the
 *   served stylesheet (rule disappears, wrong MIME type, or 404 on the
 *   linked chunk URL). Distinct from bd-vvi (dev:rsc CSS not updating
 *   without manual refresh) — this is `dev:ssr` mode going *backwards*
 *   on an edit, not just failing to update.
 *
 * Hypothesis: the SSR worker caches a compiled CSS chunk by URL, the
 * edit invalidates the source file but the worker doesn't rebuild the
 * chunk before the next request, so the linked URL points at a stale
 * or now-missing artifact.
 *
 * This spec spawns its own bidoof-template dev server WITHOUT
 * `--conditions react-server` (the dev:ssr path), edits a module CSS
 * file, then re-requests the page (refresh allowed for this test — we
 * are not testing HMR auto-update here, just that the served output
 * doesn't regress).
 *
 * Same self-contained-server pattern as dev-ssr-server-actions.spec.ts.
 */
import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const bidoofDir = join(__dirname, "../../../bidoof-template");
const cssFile = join(bidoofDir, "src/css/home.module.css");

// Pick a random high port to avoid collisions with the global webServer
// (3200) and with stale vite processes left by an aborted prior run.
const PORT = 33000 + Math.floor(Math.random() * 1000);
const BASE_URL = `http://localhost:${PORT}`;

let server: ChildProcess | undefined;
let originalCss: string | undefined;

async function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`);
}

test.beforeAll(async () => {
  originalCss = await readFile(cssFile, "utf-8");

  // dev:ssr-equivalent: NO --conditions react-server in NODE_OPTIONS.
  server = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], {
    cwd: bidoofDir,
    shell: true,
    env: {
      ...process.env,
      NODE_OPTIONS: "",
      NODE_ENV: "development",
      BASE_URL: "/",
      PUBLIC_ORIGIN: BASE_URL,
      FORCE_COLOR: "1",
      // Match the dev:rsc fixture (server.ts) — WSL2 inotify on /mnt
      // paths is unreliable; polling is needed for the file watcher to
      // notice .module.css edits at all.
      CHOKIDAR_USEPOLLING: "true",
      CHOKIDAR_INTERVAL: "500",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.on("data", (d) => process.stdout.write(`[dev:ssr-css] ${d}`));
  server.stderr?.on("data", (d) => process.stderr.write(`[dev:ssr-css] ${d}`));

  await waitForServer(BASE_URL, 60_000);
}, 90_000);

test.afterAll(async () => {
  // Always restore the CSS, even if the test bailed mid-edit.
  if (originalCss !== undefined) {
    await writeFile(cssFile, originalCss);
  }
  if (server && !server.killed) {
    server.kill("SIGTERM");
    await new Promise<void>((r) => {
      const t = setTimeout(() => r(), 2000);
      server!.once("exit", () => {
        clearTimeout(t);
        r();
      });
    });
  }
});

// bd-5rk regression: in dev:ssr the SSR worker imports compiled CSS modules
// through Node's loader, which caches by URL. Before the fix, CSS edits did
// not trigger a worker restart, so reloading the page re-rendered with the
// pre-edit class hashes. Fix lives in plugin/dev-server/plugin.client.ts
// (CSS files now route through the same worker-invalidation path as .ts/.tsx).
test("dev:ssr applies CSS-module edits after reload (bd-5rk)", async ({ page }) => {
  await page.goto(BASE_URL + "/");

  // The .Home class hash-name varies; target the outermost Home-prefixed div.
  const home = page.locator('div[class*="Home"]').first();
  await expect(home).toHaveCSS("font-size", "50px");

  // Edit the CSS — bump font-size to 60px.
  const updated = originalCss!.replace("font-size: 50px", "font-size: 60px");
  await writeFile(cssFile, updated);

  // Reload. This test is NOT about HMR auto-update (that's bd-vvi). It's
  // about whether dev:ssr serves correct styles after an edit at all —
  // the reported symptom was "CSS simply breaks" after an edit, which
  // would persist even across an explicit refresh.
  await page.reload();

  // The actual rule must apply — font-size now 60px. If dev:ssr is
  // serving a stale chunk, a missing chunk, or an HTML error in place
  // of the CSS, this would either time out at 50px or fall back to the
  // browser default (~16px) for the matched element.
  await expect(home).toHaveCSS("font-size", "60px");

  // Also: nothing on the page should have downgraded to "no class
  // applied" — the home div still has *some* Home-prefixed class.
  await expect(home).toHaveAttribute("class", /Home/);
});

// Live-HMR variant: edit the CSS and expect the rule to apply *without* a
// page.reload(). Before this fix, plugin.client.ts's hotUpdate for CSS files
// fired vprs's WS event but didn't return [], so Vite emitted its default
// `vite:beforeFullReload` event right after — the browser did a hard reload,
// which is functional but not HMR. plugin.client.ts now returns [] for CSS
// edits to suppress that reload, and useRscHmr's `kind: 'css'` branch
// cache-busts <link rel="stylesheet"> tags so the new rules apply live.
test("dev:ssr applies CSS-module edits live without a manual reload", async ({ page }) => {
  await page.goto(BASE_URL + "/");

  const home = page.locator('div[class*="Home"]').first();
  await expect(home).toHaveCSS("font-size", "50px");

  // Track navigation events: if Vite's full-reload fallback fires, we'll
  // see a `framenavigated` to the same URL — that would be a failure mode
  // for this test (functional but not HMR).
  let navigations = 0;
  page.on("framenavigated", () => {
    navigations++;
  });

  const updated = originalCss!.replace("font-size: 50px", "font-size: 60px");
  await writeFile(cssFile, updated);

  // No page.reload() — wait for the rule to apply via HMR.
  await expect(home).toHaveCSS("font-size", "60px", { timeout: 10_000 });

  // The HMR path should not have triggered a full page navigation. We
  // allow zero here — any non-zero count means Vite's full-reload fallback
  // fired or the test framework navigated, both of which defeat live HMR.
  expect(navigations).toBe(0);
});
