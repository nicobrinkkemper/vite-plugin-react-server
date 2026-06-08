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
 * This file pairs a CONTROL (server-component CSS — the working path) with
 * the failing case (client-component CSS — the bug). The control proves the
 * harness itself works under dev:rsc; the client case is the red regression
 * guard that should go green once the client-graph CSS HMR path is fixed.
 *
 * Both targets live on the home page (`/`) of the bidoof-template fixture:
 *   - SERVER CSS:  src/css/home.module.css `.Home` font-size — imported by
 *     the server component src/page/page.tsx.
 *   - CLIENT CSS:  src/css/counterStyles.module.css `.Counter` color —
 *     imported directly by the "use client" component
 *     src/components/Counter.client.tsx, which the home page always renders.
 *
 * Self-contained-server pattern (own detached process group, process-group
 * kill in afterAll, WSL2 polling watcher) matches dev-fast-refresh.spec.ts.
 * Each test restores the CSS file it edits to its original bytes in a
 * try/finally so a failure can't leave the fixture dirty.
 */
import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const bidoofDir = join(__dirname, "../../../bidoof-template");
const serverCssFile = join(bidoofDir, "src/css/home.module.css");
const clientCssFile = join(bidoofDir, "src/css/counterStyles.module.css");

// dev:rsc — carry the global react-server condition (unlike dev:ssr).
const PORT = 33800;
const BASE_URL = `http://localhost:${PORT}`;

async function waitForServer(url: string, timeoutMs = 60_000): Promise<void> {
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

// Serial single-worker suite: spawn exactly one dev:rsc server for both tests.
test.describe("dev:rsc CSS-module HMR", () => {
  test.describe.configure({ mode: "serial", retries: 0 });

  let server: ChildProcess | undefined;

  test.beforeAll(async () => {
    server = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], {
      cwd: bidoofDir,
      shell: true,
      // Own process group so afterAll can kill the whole tree (shell -> npx
      // -> vite -> esbuild); killing just the parent orphans vite and leaks
      // the port to the next run.
      detached: true,
      env: {
        ...process.env,
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
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout?.on("data", (d) => process.stdout.write(`[dev:rsc-css] ${d}`));
    server.stderr?.on("data", (d) => process.stderr.write(`[dev:rsc-css] ${d}`));
    await waitForServer(BASE_URL, 60_000);
  }, 90_000);

  test.afterAll(async () => {
    // Kill the whole process group (negative pid), wait for the real exit,
    // escalate to SIGKILL — so vite/esbuild children don't orphan + hold the
    // port for the next run.
    const pid = server?.pid;
    if (pid && server && server.exitCode === null && server.signalCode === null) {
      await new Promise<void>((resolve) => {
        server!.once("exit", () => resolve());
        try {
          process.kill(-pid, "SIGTERM");
        } catch {
          server!.kill("SIGTERM");
        }
        setTimeout(() => {
          if (server && server.exitCode === null && server.signalCode === null) {
            try {
              process.kill(-pid, "SIGKILL");
            } catch {
              server.kill("SIGKILL");
            }
          }
        }, 2000);
      });
    }
  });

  // CONTROL — the working path. A SERVER-component CSS module edit must
  // hot-update live without a full reload. If this fails, the harness/server
  // is broken and the client result below is meaningless.
  test("server-component CSS module hot-updates live (control, should pass)", async ({
    page,
  }) => {
    const original = await readFile(serverCssFile, "utf-8");
    expect(original).toContain("font-size: 50px");
    try {
      await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });

      const home = page.locator('div[class*="Home"]').first();
      await expect(home).toHaveCSS("font-size", "50px");

      // Sentinel: a full page reload creates a fresh window and wipes this.
      await page.evaluate(() => {
        (window as unknown as { __noReload?: boolean }).__noReload = true;
      });

      // Edit the server-graph CSS: bump .Home font-size 50px -> 60px.
      await writeFile(serverCssFile, original.replace("font-size: 50px", "font-size: 60px"));

      // Expect the rule to apply via HMR (no page.reload()).
      await expect(home).toHaveCSS("font-size", "60px", { timeout: 12_000 });

      // And it must have been HMR, not a full reload.
      const noReload = await page.evaluate(
        () => (window as unknown as { __noReload?: boolean }).__noReload === true
      );
      expect(noReload, "page did a full reload instead of HMR").toBe(true);
    } finally {
      await writeFile(serverCssFile, original);
    }
  });

  // THE BUG — currently RED. A CSS module imported directly by a "use client"
  // component (counterStyles.module.css <- Counter.client.tsx) does NOT
  // hot-update under dev:rsc: the style never changes without a manual
  // refresh, and no auto full-reload fires. This test should FAIL until the
  // client-graph CSS HMR path is fixed, then become the regression guard.
  test("client-component CSS module hot-updates live (BUG: currently fails)", async ({
    page,
  }) => {
    const original = await readFile(clientCssFile, "utf-8");
    // Original .Counter color is rgb(255, 0, 0) (red).
    expect(original).toContain("rgb(255, 0, 0)");
    try {
      await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });

      const counter = page.getByRole("button", { name: /Click count/i });
      await expect(counter).toBeVisible();
      await expect(counter).toHaveCSS("color", "rgb(255, 0, 0)");

      // Sentinel: a full page reload would wipe this. (Manual-refresh-only is
      // the reported symptom; we assert the style updates AND no reload fired.)
      await page.evaluate(() => {
        (window as unknown as { __noReload?: boolean }).__noReload = true;
      });

      // Edit the client-graph CSS: change .Counter color red -> lime.
      await writeFile(
        clientCssFile,
        original.replace("rgb(255, 0, 0)", "rgb(0, 255, 0)")
      );

      // Expect the new color via HMR (no page.reload()). Under the bug this
      // never happens within the budget, so the assertion times out (red).
      await expect(counter).toHaveCSS("color", "rgb(0, 255, 0)", { timeout: 12_000 });

      // Guard against a "green via full reload" false pass: it must be HMR.
      const noReload = await page.evaluate(
        () => (window as unknown as { __noReload?: boolean }).__noReload === true
      );
      expect(noReload, "page did a full reload instead of HMR").toBe(true);
    } finally {
      await writeFile(clientCssFile, original);
    }
  });
});
