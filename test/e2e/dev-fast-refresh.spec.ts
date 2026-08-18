/**
 * Fast Refresh + HMR matrix across dev:rsc and dev:ssr.
 *
 * Codifies the dev cases that were being reproduced by hand:
 *   - first paint renders cleanly,
 *   - editing a CLIENT component hot-updates AND preserves state (Fast
 *     Refresh) without a full reload,
 *   - REPEATED client edits keep working (the "works once, then breaks" report
 *     under dev:rsc),
 *   - editing a SERVER component updates the view (RSC HMR refetch),
 *   - a hard refresh renders without tripping the condition guard.
 *
 * Every case also asserts that vprs's condition guard
 * ("Condition mismatch …" / "react … under the wrong condition") never fires.
 *
 * All cases pass as of the dev-only extension fix: vprs no longer maps
 * client-ref ids to `.js` in dev, so Fast Refresh's incremental fetch hits the
 * real `.tsx` module instead of a phantom `.client.js.tsx` (404). This matrix
 * now guards against Fast-Refresh / HMR regressions under RSC.
 *
 * Requires the bidoof-template fixture to have `@vitejs/plugin-react` wired
 * (`react()` before `vitePluginReactServer()`); without it the FR cases just
 * full-reload and the state-preservation assertions fail.
 */
import { test, expect, type Page } from "@playwright/test";
import { type ChildProcess } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnViteDev, stopViteDev, waitForServer } from "./devServer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const bidoofDir = join(__dirname, "../../../bidoof-template");
const counterFile = join(bidoofDir, "src/components/Counter.client.tsx");
const pageFile = join(bidoofDir, "src/page/page.tsx");

const CONDITION_RE = /Condition mismatch|wrong condition|under the wrong|loaded under/i;

/** Collect condition-guard warnings + uncaught page errors for an assertion. */
function watchIssues(page: Page): string[] {
  const issues: string[] = [];
  page.on("console", (m) => {
    if (CONDITION_RE.test(m.text())) issues.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => issues.push(`pageerror: ${e.message}`));
  return issues;
}

type Mode = "rsc" | "ssr";

function defineSuite(mode: Mode, port: number) {
  test.describe(`Fast Refresh + HMR — dev:${mode}`, () => {
    // Serial (single worker) so beforeAll spawns exactly one server for this
    // mode — under the default parallelism each worker would re-run beforeAll
    // and collide on the port. No retries for the same reason.
    test.describe.configure({ mode: "serial", retries: 0 });
    let server: ChildProcess | undefined;
    let origCounter = "";
    let origPage = "";
    // Accumulate the dev server's stdout+stderr so a test can assert the node
    // console stays clean — the "react-server condition must be enabled" error
    // on dev:ssr full reloads only shows here, not in the browser.
    let serverLog = "";
    const baseURL = `http://localhost:${port}`;

    test.beforeAll(async () => {
      origCounter = await readFile(counterFile, "utf-8");
      origPage = await readFile(pageFile, "utf-8");
      server = spawnViteDev({
        dir: bidoofDir,
        port,
        env: {
          // dev:rsc carries the global react-server condition; dev:ssr does not.
          NODE_OPTIONS: mode === "rsc" ? "--conditions react-server" : "",
          NODE_ENV: "development",
          BASE_URL: "/",
          PUBLIC_ORIGIN: baseURL,
          FORCE_COLOR: "1",
          // WSL2 inotify on /mnt is unreliable; poll so edits are noticed.
          CHOKIDAR_USEPOLLING: "true",
          CHOKIDAR_INTERVAL: "500",
        },
      });
      server.stdout?.on("data", (d) => {
        serverLog += d;
        process.stdout.write(`[dev:${mode}] ${d}`);
      });
      server.stderr?.on("data", (d) => {
        serverLog += d;
        process.stderr.write(`[dev:${mode}] ${d}`);
      });
      await waitForServer(baseURL, 60_000);
    }, 90_000);

    test.afterEach(async () => {
      // Restore both fixture files between tests so each starts from a clean
      // source (tests edit the same files), then let the watcher settle.
      await writeFile(counterFile, origCounter).catch(() => {});
      await writeFile(pageFile, origPage).catch(() => {});
      await new Promise((r) => setTimeout(r, 400));
    });

    test.afterAll(async () => {
      await writeFile(counterFile, origCounter).catch(() => {});
      await writeFile(pageFile, origPage).catch(() => {});
      await stopViteDev(server);
    });

    test("first paint renders without condition errors", async ({ page }) => {
      const issues = watchIssues(page);
      await page.goto(baseURL, { waitUntil: "networkidle" });
      await expect(
        page.getByRole("heading", { name: /vite-plugin-react-server demo/i })
      ).toBeVisible();
      expect(issues, issues.join("\n")).toEqual([]);
    });

    test("client edit → Fast Refresh preserves state, no full reload", async ({
      page,
    }) => {
      const issues = watchIssues(page);
      await page.goto(baseURL, { waitUntil: "networkidle" });
      const counter = page.getByRole("button", { name: /Click count/i });
      await counter.click();
      await counter.click();
      await expect(counter).toHaveText(/Click count: 2/);
      // Marker that a full page reload would wipe; Fast Refresh preserves it.
      await page.evaluate(() => ((window as Window & { __fr?: string }).__fr = "alive"));

      await writeFile(counterFile, origCounter.replace("Click count", "Clicks logged"));

      // Hot-update applied…
      await expect(
        page.getByRole("button", { name: /Clicks logged/i })
      ).toBeVisible({ timeout: 8000 });
      // …state preserved (count still 2, not reset to 0)…
      await expect(
        page.getByRole("button", { name: /Clicks logged: 2/i })
      ).toBeVisible();
      // …and it was Fast Refresh, not a full reload.
      expect(
        await page.evaluate(() => (window as Window & { __fr?: string }).__fr)
      ).toBe("alive");
      expect(issues, issues.join("\n")).toEqual([]);
    });

    test("repeated client edits keep hot-updating", async ({ page }) => {
      const issues = watchIssues(page);
      await page.goto(baseURL, { waitUntil: "networkidle" });
      await page.evaluate(() => ((window as Window & { __fr2?: string }).__fr2 = "alive"));

      await writeFile(counterFile, origCounter.replace("Click count", "Tally one"));
      await expect(page.getByRole("button", { name: /Tally one/i })).toBeVisible({
        timeout: 8000,
      });

      await writeFile(counterFile, origCounter.replace("Click count", "Tally two"));
      await expect(page.getByRole("button", { name: /Tally two/i })).toBeVisible({
        timeout: 8000,
      });

      expect(
        await page.evaluate(() => (window as Window & { __fr2?: string }).__fr2)
      ).toBe("alive");
      expect(issues, issues.join("\n")).toEqual([]);
    });

    test("server-component edit → view updates via HMR", async ({ page }) => {
      const issues = watchIssues(page);
      await page.goto(baseURL, { waitUntil: "networkidle" });

      await writeFile(
        pageFile,
        origPage.replace("vite-plugin-react-server demo", "RSC demo updated")
      );
      await expect(
        page.getByRole("heading", { name: /RSC demo updated/i })
      ).toBeVisible({ timeout: 10000 });
      expect(issues, issues.join("\n")).toEqual([]);
    });

    test("hard refresh renders without condition errors", async ({ page }) => {
      const issues = watchIssues(page);
      await page.goto(baseURL, { waitUntil: "networkidle" });
      await page.reload({ waitUntil: "networkidle" });
      await expect(
        page.getByRole("heading", { name: /vite-plugin-react-server demo/i })
      ).toBeVisible();
      expect(issues, issues.join("\n")).toEqual([]);
    });

    // Runs last (serial): the prior edits would, on dev:ssr, have triggered the
    // node-console "react-server condition must be enabled" error during Vite's
    // full reload if the props pre-load weren't gated to dev:rsc.
    test("node console has no react-server condition error", () => {
      expect(
        serverLog,
        serverLog.slice(-800)
      ).not.toMatch(/condition must be enabled|error happened during full reload/i);
    });
  });
}

// Two suites in one file run serially in a single worker, so they don't race
// on the shared fixture files or fight for a port.
defineSuite("rsc", 33700);
defineSuite("ssr", 33701);
