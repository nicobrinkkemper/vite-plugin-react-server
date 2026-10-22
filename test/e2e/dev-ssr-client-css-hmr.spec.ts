/**
 * Regression coverage for a dev:ssr HMR bug — the dev:ssr analog of the
 * dev:rsc gap fixed in #96 (test/e2e/dev-rsc-client-css-hmr.spec.ts):
 *
 *   In dev:ssr (the client-first dev mode — NO `--conditions react-server`),
 *   editing a `*.module.css` reachable ONLY through a CLIENT component (a
 *   `"use client"` file that imports the CSS module directly) must hot-update
 *   live without a manual refresh.
 *
 * Both targets live on the home page (`/`) after `installClientFixtures`:
 *   - SERVER CSS:  src/css/home.module.css `.Panel h1` font-size
 *   - CLIENT CSS:  src/css/counterStyles.module.css `.Counter` color
 */
import { test, expect } from "@playwright/test";
import { type ChildProcess } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveBidoofDir } from "./bidoofDir.js";
import {
  installClientFixtures,
  uninstallClientFixtures,
  type ClientFixtureHandle,
} from "./clientFixtures.js";
import { spawnViteDev, stopViteDev, waitForServer } from "./devServer.js";

const bidoofDir = resolveBidoofDir();
const serverCssFile = join(bidoofDir, "src/css/home.module.css");
const clientCssFile = join(bidoofDir, "src/css/counterStyles.module.css");

// dev:ssr — NO global react-server condition (unlike dev:rsc).
const PORT = 33810;
const BASE_URL = `http://localhost:${PORT}`;

const SERVER_FONT_FROM = "font-size: 42px";
const SERVER_FONT_TO = "font-size: 52px";

// Serial single-worker suite: spawn exactly one dev:ssr server for both tests.
test.describe("dev:ssr CSS-module HMR", () => {
  test.describe.configure({ mode: "serial", retries: 0 });

  let server: ChildProcess | undefined;
  let fixtures: ClientFixtureHandle | undefined;

  test.beforeAll(async () => {
    fixtures = await installClientFixtures(bidoofDir);
    server = spawnViteDev({
      dir: bidoofDir,
      port: PORT,
      env: {
        // dev:ssr is the client-first mode: NO react-server condition.
        NODE_OPTIONS: "",
        NODE_ENV: "development",
        BASE_URL: "/",
        PUBLIC_ORIGIN: BASE_URL,
        FORCE_COLOR: "1",
        // WSL2 inotify on /mnt is unreliable; poll so .module.css edits are
        // noticed by the file watcher at all.
        CHOKIDAR_USEPOLLING: "true",
        CHOKIDAR_INTERVAL: "500",
      },
    });
    server.stdout?.on("data", (d) => process.stdout.write(`[dev:ssr-css] ${d}`));
    server.stderr?.on("data", (d) => process.stderr.write(`[dev:ssr-css] ${d}`));
    await waitForServer(BASE_URL, 60_000);
  }, 90_000);

  test.afterAll(async () => {
    await stopViteDev(server);
    await uninstallClientFixtures(fixtures);
  });

  // CONTROL — the working path. A SERVER-component CSS module edit must
  // hot-update live without a full reload. If this fails, the harness/server
  // is broken and the client result below is meaningless.
  test("server-component CSS module hot-updates live (control, should pass)", async ({
    page,
  }) => {
    const original = await readFile(serverCssFile, "utf-8");
    expect(original).toContain(SERVER_FONT_FROM);
    try {
      await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });

      const heading = page.locator('div[class*="Panel"] h1').first();
      await expect(heading).toHaveCSS("font-size", "42px");

      await page.evaluate(() => {
        (window as unknown as { __noReload?: boolean }).__noReload = true;
      });

      await writeFile(
        serverCssFile,
        original.replace(SERVER_FONT_FROM, SERVER_FONT_TO),
      );

      await expect(heading).toHaveCSS("font-size", "52px", { timeout: 12_000 });

      const noReload = await page.evaluate(
        () => (window as unknown as { __noReload?: boolean }).__noReload === true
      );
      expect(noReload, "page did a full reload instead of HMR").toBe(true);
    } finally {
      await writeFile(serverCssFile, original);
    }
  });

  test("client-component CSS module hot-updates live", async ({ page }) => {
    const original = await readFile(clientCssFile, "utf-8");
    expect(original).toContain("rgb(255, 0, 0)");
    try {
      await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });

      const counter = page.getByRole("button", { name: /Click count/i });
      await expect(counter).toBeVisible();
      await expect(counter).toHaveCSS("color", "rgb(255, 0, 0)");

      await page.evaluate(() => {
        (window as unknown as { __noReload?: boolean }).__noReload = true;
      });

      await writeFile(
        clientCssFile,
        original.replace("rgb(255, 0, 0)", "rgb(0, 255, 0)")
      );

      await expect(counter).toHaveCSS("color", "rgb(0, 255, 0)", { timeout: 12_000 });

      const noReload = await page.evaluate(
        () => (window as unknown as { __noReload?: boolean }).__noReload === true
      );
      expect(noReload, "page did a full reload instead of HMR").toBe(true);
    } finally {
      await writeFile(clientCssFile, original);
    }
  });
});
