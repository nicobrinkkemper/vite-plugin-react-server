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
