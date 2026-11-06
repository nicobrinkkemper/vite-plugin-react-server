/**
 * Regression test:
 *
 *   Browser-driven server actions appeared to succeed under `dev:ssr` but
 *   their effect was invisible after a page refresh. Root cause: the RSC
 *   worker's messageHandler cached the result of calling props() across
 *   requests, keyed by URL. Server actions write to mutable state that
 *   props() reads, so the next RSC payload still served the pre-action
 *   pageProps. dev:rsc didn't go through the same worker code path so it
 *   didn't repro there — and `playwright.config.ts` only exercises dev:rsc,
 *   so e2e was clean while dev:ssr silently lied.
 *
 * This spec spawns its own bidoof-template dev server WITHOUT
 * `--conditions react-server` (the dev:ssr path), drives a real browser
 * against an e2e-owned `/e2e-actions/` route whose props() reads persisted
 * state into the flight payload, refreshes, and asserts persistence.
 *
 * It does NOT use the global `webServer` in `playwright.config.ts`. That
 * one stays on the dev:rsc path for the existing HMR/navigation specs.
 */
import { test, expect } from "@playwright/test";
import { type ChildProcess } from "node:child_process";
import {
  installActionFixtures,
  uninstallActionFixtures,
  type ActionFixtureHandle,
} from "./actionFixtures.js";
import { resolveBidoofDir } from "./bidoofDir.js";
import {
  removeRouteFromSharedServer,
  spawnViteDev,
  stopViteDev,
  waitForServer,
} from "./devServer.js";
import { readItems, writeItems } from "./serverActionFixtures.js";

const bidoofDir = resolveBidoofDir();
// Pick a random high port to avoid collisions with the global webServer
// (3200) and with stale vite processes left by an aborted prior run.
const PORT = 32000 + Math.floor(Math.random() * 1000);
const BASE_URL = `http://localhost:${PORT}`;

let server: ChildProcess | undefined;
let fixtures: ActionFixtureHandle | undefined;

const actionState = () => {
  if (!fixtures) throw new Error("action fixtures are not installed");
  return fixtures.actions;
};

test.beforeAll(async () => {
  fixtures = await installActionFixtures(bidoofDir);

  // dev:ssr-equivalent: NO --conditions react-server in NODE_OPTIONS.
  // The plugin runs in client-mode and spawns the RSC worker with the
  // condition flipped — that worker is the one that previously cached
  // props across requests and silently dropped action effects.
  server = spawnViteDev({
    dir: bidoofDir,
    port: PORT,
    env: {
      NODE_OPTIONS: "",
      NODE_ENV: "development",
      BASE_URL: "/",
      PUBLIC_ORIGIN: BASE_URL,
      FORCE_COLOR: "1",
    },
  });
  server.stdout?.on("data", (d) => process.stdout.write(`[dev:ssr] ${d}`));
  server.stderr?.on("data", (d) => process.stderr.write(`[dev:ssr] ${d}`));

  // Re-optimizing deps + plugin warm-up regularly takes 20-40s when the
  // global webServer is also coming up in parallel; the default 30s hook
  // budget is too tight on cold runs.
  await waitForServer(BASE_URL, 60_000);
}, 90_000);

test.afterAll(async ({ browser }) => {
  await stopViteDev(server);
  await removeRouteFromSharedServer(browser, "/e2e-actions/index.rsc", () =>
    uninstallActionFixtures(fixtures),
  );
});

test.describe("server actions persist under dev:ssr", () => {
  test("delete-then-refresh reflects the deletion", async ({ page }) => {
    await writeItems(actionState(), ["alpha", "beta", "gamma"]);

    await page.goto(`${BASE_URL}/e2e-actions/`, { waitUntil: "networkidle" });
    const items = page.getByTestId("e2e-items").locator("li");
    const titlesBefore = await items
      .allTextContents()
      .then((arr) => arr.map((t) => t.replace(/\s+/g, " ").trim()));
    expect(titlesBefore.length).toBe(3);
    expect(titlesBefore.some((t) => t.startsWith("alpha"))).toBe(true);

    await items.getByRole("button", { name: "Delete" }).first().click();

    // The action must persist: alpha is gone, beta/gamma remain.
    await expect.poll(() => readItems(actionState())).toEqual(["beta", "gamma"]);

    // The page on hard reload must agree with that state. Before the fix this
    // returned cached pageProps and showed alpha back.
    await page.reload({ waitUntil: "networkidle" });
    const titlesAfter = await items
      .allTextContents()
      .then((arr) => arr.map((t) => t.replace(/\s+/g, " ").trim()));
    expect(titlesAfter.length).toBe(2);
    expect(titlesAfter.some((t) => t.startsWith("alpha"))).toBe(false);
    expect(titlesAfter.some((t) => t.startsWith("beta"))).toBe(true);
    expect(titlesAfter.some((t) => t.startsWith("gamma"))).toBe(true);
  });

  test("RSC route returns fresh props on every request (no cross-request cache)", async () => {
    await writeItems(actionState(), ["one", "two", "three"]);

    const first = await fetch(`${BASE_URL}/e2e-actions/index.rsc`, {
      headers: { Accept: "text/x-component" },
    });
    const firstBody = await first.text();
    expect(firstBody).toContain('"one"');
    expect(firstBody).toContain('"two"');
    expect(firstBody).toContain('"three"');

    // Mutate the state out of band (simulating any server action effect).
    await writeItems(actionState(), ["two", "three"]);

    const second = await fetch(`${BASE_URL}/e2e-actions/index.rsc`, {
      headers: { Accept: "text/x-component" },
    });
    const secondBody = await second.text();
    expect(secondBody).not.toContain('"one"');
    expect(secondBody).toContain('"two"');
    expect(secondBody).toContain('"three"');
  });
});
