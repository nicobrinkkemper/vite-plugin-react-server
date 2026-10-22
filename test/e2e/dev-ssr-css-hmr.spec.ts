/**
 * Regression coverage:
 *
 *   Reported: editing a *.module.css file in `dev:ssr` mode breaks the
 *   served stylesheet (rule disappears, wrong MIME type, or 404 on the
 *   linked chunk URL). Distinct from dev:rsc CSS not updating
 *   without manual refresh — this is `dev:ssr` mode going *backwards*
 *   on an edit, not just failing to update.
 *
 * This spec spawns its own bidoof-template dev server WITHOUT
 * `--conditions react-server` (the dev:ssr path), edits the home-page
 * module CSS (`.Panel h1` font-size), then asserts the served output
 * updates both after reload and live via HMR.
 */
import { test, expect } from "@playwright/test";
import { type ChildProcess } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveBidoofDir } from "./bidoofDir.js";
import { spawnViteDev, stopViteDev, waitForServer } from "./devServer.js";

const bidoofDir = resolveBidoofDir();
const cssFile = join(bidoofDir, "src/css/home.module.css");

const PORT = 33000 + Math.floor(Math.random() * 1000);
const BASE_URL = `http://localhost:${PORT}`;

const FONT_FROM = "font-size: 42px";
const FONT_TO = "font-size: 52px";

let server: ChildProcess | undefined;
let originalCss: string | undefined;

test.beforeAll(async () => {
  originalCss = await readFile(cssFile, "utf-8");
  expect(originalCss).toContain(FONT_FROM);

  server = spawnViteDev({
    dir: bidoofDir,
    port: PORT,
    env: {
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
  });
  server.stdout?.on("data", (d) => process.stdout.write(`[dev:ssr-css] ${d}`));
  server.stderr?.on("data", (d) => process.stderr.write(`[dev:ssr-css] ${d}`));

  await waitForServer(BASE_URL, 60_000);
}, 90_000);

test.afterEach(async () => {
  if (originalCss !== undefined) {
    await writeFile(cssFile, originalCss);
  }
});

test.afterAll(async () => {
  if (originalCss !== undefined) {
    await writeFile(cssFile, originalCss);
  }
  await stopViteDev(server);
});

// Regression: in dev:ssr the SSR worker imports compiled CSS modules
// through Node's loader, which caches by URL. Before the fix, CSS edits did
// not trigger a worker restart, so reloading the page re-rendered with the
// pre-edit class hashes. Fix lives in plugin/dev-server/plugin.client.ts
// (CSS files now route through the same worker-invalidation path as .ts/.tsx).
test("dev:ssr applies CSS-module edits after reload", async ({ page }) => {
  await page.goto(BASE_URL + "/");

  const heading = page.locator('div[class*="Panel"] h1').first();
  await expect(heading).toHaveCSS("font-size", "42px");

  const updated = originalCss!.replace(FONT_FROM, FONT_TO);
  await writeFile(cssFile, updated);

  await page.reload();

  await expect(heading).toHaveCSS("font-size", "52px");
  await expect(page.locator('div[class*="Home"]').first()).toHaveAttribute(
    "class",
    /Home/,
  );
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

  const heading = page.locator('div[class*="Panel"] h1').first();
  await expect(heading).toHaveCSS("font-size", "42px");

  await page.evaluate(() => {
    (window as unknown as { __hmrLiveMarker?: number }).__hmrLiveMarker = Date.now();
  });

  const updated = originalCss!.replace(FONT_FROM, FONT_TO);
  await writeFile(cssFile, updated);

  await expect(heading).toHaveCSS("font-size", "52px", { timeout: 10_000 });

  const markerStillPresent = await page.evaluate(() => {
    return typeof (window as unknown as { __hmrLiveMarker?: number })
      .__hmrLiveMarker === "number";
  });
  expect(markerStillPresent).toBe(true);
});
