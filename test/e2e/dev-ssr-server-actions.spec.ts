/**
 * Regression test for bd-5xu (2026-04-30):
 *
 *   Browser-driven server actions appeared to succeed under `dev:ssr` but
 *   their effect was invisible after a page refresh. Root cause: the RSC
 *   worker's messageHandler cached the result of calling props() across
 *   requests, keyed by URL. Server actions write to mutable state that
 *   props() reads, so the next /todos/index.rsc still served the pre-action
 *   pageProps. dev:rsc didn't go through the same worker code path so it
 *   didn't repro there — and `playwright.config.ts` only exercises dev:rsc,
 *   so e2e was clean while dev:ssr silently lied.
 *
 * This spec spawns its own bidoof-template dev server WITHOUT
 * `--conditions react-server` (the dev:ssr path), drives a real browser
 * to delete a todo, refreshes, and asserts the deletion is reflected.
 *
 * It does NOT use the global `webServer` in `playwright.config.ts`. That
 * one stays on the dev:rsc path for the existing HMR/navigation specs.
 */
import { test, expect } from "@playwright/test";
import { type ChildProcess } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnViteDev, stopViteDev, waitForServer } from "./devServer.js";
import { DatabaseSync } from "node:sqlite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const bidoofDir = join(__dirname, "../../../bidoof-template");
const dbPath = join(bidoofDir, "todos.db");
// Pick a random high port to avoid collisions with the global webServer
// (3200) and with stale vite processes left by an aborted prior run.
const PORT = 32000 + Math.floor(Math.random() * 1000);
const BASE_URL = `http://localhost:${PORT}`;

let server: ChildProcess | undefined;

function seedTodos(titles: string[]): void {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(
      `CREATE TABLE IF NOT EXISTS todos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        completed INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      ) STRICT`,
    );
    db.prepare("DELETE FROM todos").run();
    const insert = db.prepare("INSERT INTO todos (title) VALUES (?)");
    for (const title of titles) insert.run(title);
  } finally {
    db.close();
  }
}

function readTodos(): { id: number; title: string }[] {
  const db = new DatabaseSync(dbPath);
  try {
    return db.prepare("SELECT id, title FROM todos ORDER BY id").all() as {
      id: number;
      title: string;
    }[];
  } finally {
    db.close();
  }
}

test.beforeAll(async () => {
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

test.afterAll(async () => {
  await stopViteDev(server);
});

test.describe("server actions persist under dev:ssr (bd-5xu)", () => {
  test("delete-then-refresh reflects the deletion", async ({ page }) => {
    seedTodos(["alpha", "beta", "gamma"]);
    expect(readTodos().map((t) => t.title)).toEqual(["alpha", "beta", "gamma"]);

    await page.goto(`${BASE_URL}/todos`, { waitUntil: "networkidle" });
    const titlesBefore = await page
      .locator("li")
      .allTextContents()
      .then((arr) => arr.map((t) => t.replace(/\s+/g, " ").trim()));
    expect(titlesBefore.length).toBe(3);
    expect(titlesBefore.some((t) => t.startsWith("alpha"))).toBe(true);

    await page
      .locator("button:has-text('×'), button:has-text('Delete')")
      .first()
      .click();
    // Wait for the action POST to round-trip.
    await page.waitForTimeout(1500);

    // DB must reflect the delete: alpha is gone, beta/gamma remain.
    const dbAfterAction = readTodos().map((t) => t.title);
    expect(dbAfterAction).toEqual(["beta", "gamma"]);

    // The page on hard reload must agree with the DB. Pre-bd-5xu this
    // returned cached pageProps and showed alpha back.
    await page.reload({ waitUntil: "networkidle" });
    const titlesAfter = await page
      .locator("li")
      .allTextContents()
      .then((arr) => arr.map((t) => t.replace(/\s+/g, " ").trim()));
    expect(titlesAfter.length).toBe(2);
    expect(titlesAfter.some((t) => t.startsWith("alpha"))).toBe(false);
    expect(titlesAfter.some((t) => t.startsWith("beta"))).toBe(true);
    expect(titlesAfter.some((t) => t.startsWith("gamma"))).toBe(true);
  });

  test("RSC route returns fresh props on every request (no cross-request cache)", async () => {
    seedTodos(["one", "two", "three"]);

    const first = await fetch(`${BASE_URL}/todos/index.rsc`, {
      headers: { Accept: "text/x-component" },
    });
    const firstBody = await first.text();
    expect(firstBody).toContain('"title":"one"');
    expect(firstBody).toContain('"title":"two"');
    expect(firstBody).toContain('"title":"three"');

    // Mutate DB out of band (simulating any server action effect).
    const db = new DatabaseSync(dbPath);
    db.prepare("DELETE FROM todos WHERE title = 'one'").run();
    db.close();

    const second = await fetch(`${BASE_URL}/todos/index.rsc`, {
      headers: { Accept: "text/x-component" },
    });
    const secondBody = await second.text();
    expect(secondBody).not.toContain('"title":"one"');
    expect(secondBody).toContain('"title":"two"');
    expect(secondBody).toContain('"title":"three"');
  });
});
