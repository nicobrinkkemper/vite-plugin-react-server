/**
 * Regression coverage for a dev:rsc HMR bug:
 *
 *   In the dev:rsc mode (NODE_OPTIONS='--conditions react-server' + vite),
 *   editing a `*.module.css` that is reachable ONLY through a CLIENT
 *   component (a file with the `"use client"` directive that imports the
 *   CSS module directly) does NOT hot-update the styles in the browser.
 *   A manual refresh is required — and no automatic full reload fires
 *   either, so the new rules simply never reach the page. The HMR update
 *   for the client-graph CSS isn't emitted to the browser at all.
 *
 *   CSS modules used by SERVER components DO hot-update under dev:rsc (the
 *   RSC subtree re-streams and the linked stylesheet is cache-busted), so
 *   the bug is isolated to the client module graph.
 *
 * Both targets live on the home page (`/`) after `installClientFixtures`:
 *   - SERVER CSS:  src/css/home.module.css `.Panel h1` font-size — imported by
 *     the server component src/page/page.tsx.
 *   - CLIENT CSS:  src/css/counterStyles.module.css `.Counter` color —
 *     imported directly by the e2e-owned Counter.client.tsx.
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

// dev:rsc — carry the global react-server condition (unlike dev:ssr).
const PORT = 33800;
const BASE_URL = `http://localhost:${PORT}`;

const SERVER_FONT_FROM = "font-size: 42px";
const SERVER_FONT_TO = "font-size: 52px";

// Serial single-worker suite: spawn exactly one dev:rsc server for both tests.
test.describe("dev:rsc CSS-module HMR", () => {
  test.describe.configure({ mode: "serial", retries: 0 });

  let server: ChildProcess | undefined;
  let fixtures: ClientFixtureHandle | undefined;

  test.beforeAll(async () => {
    fixtures = await installClientFixtures(bidoofDir);
    server = spawnViteDev({
      dir: bidoofDir,
      port: PORT,
      env: {
        // dev:rsc carries the global react-server condition.
        NODE_OPTIONS: "--conditions react-server",
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
    server.stdout?.on("data", (d) => process.stdout.write(`[dev:rsc-css] ${d}`));
    server.stderr?.on("data", (d) => process.stderr.write(`[dev:rsc-css] ${d}`));
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

      // Sentinel: a full page reload creates a fresh window and wipes this.
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

  // Client-graph CSS HMR regression guard (Counter.client.tsx → counterStyles).
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
