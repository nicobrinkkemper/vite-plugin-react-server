/**
 * Shared dev-server lifecycle for the e2e specs.
 *
 * Every spec used to `spawn("npx", ["vite", …], { shell: true })` and kill the
 * returned handle on teardown — but that handle is the WRAPPER SHELL, not vite:
 * SIGTERM may not propagate and SIGKILL definitely orphans the node child. A
 * failing spec then leaks a live dev server (100% CPU file-watcher loops were
 * observed hours later), and enough leaked servers starve every later suite
 * into worker-ready timeouts.
 *
 * spawnViteDev launches vite's real JS entry with the current node — no npx,
 * no shell — so the returned handle IS the dev-server process and kill()
 * reaches it. stopViteDev escalates SIGTERM → SIGKILL and always awaits exit.
 * Call it in afterAll unconditionally: it is a no-op for a process that never
 * started or already exited.
 */
import type { Browser } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

/** The global `webServer` from playwright.config.ts, on the same demo tree. */
const SHARED_DEV_SERVER = "http://localhost:3200";
/** Ten polls of the shared server's file watcher (server.ts). */
const ROUTE_SCAN_WINDOW_MS = 5000;

export function spawnViteDev(options: {
  dir: string;
  port: number;
  env?: Record<string, string | undefined>;
  stdio?: "inherit" | "pipe";
}): ChildProcess {
  const { dir, port, env = {}, stdio = "pipe" } = options;
  return spawn(
    process.execPath,
    [join(dir, "node_modules/vite/bin/vite.js"), "--port", String(port), "--strictPort"],
    {
      cwd: dir,
      env: { ...process.env, ...env },
      stdio: stdio === "inherit" ? "inherit" : ["ignore", "pipe", "pipe"],
    }
  );
}

export async function stopViteDev(server: ChildProcess | undefined): Promise<void> {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    const killTimer = setTimeout(() => {
      if (server.exitCode === null && server.signalCode === null) {
        server.kill("SIGKILL");
      }
    }, 2000);
    server.once("exit", () => {
      clearTimeout(killTimer);
      resolve();
    });
    server.kill("SIGTERM");
  });
}

export async function waitForServer(url: string, timeoutMs = 60_000): Promise<void> {
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

const answersFlight = async (url: string): Promise<boolean> => {
  try {
    const res = await fetch(url, { headers: { Accept: "text/x-component" } });
    return res.ok;
  } catch {
    return false; // mid-restart
  }
};

/**
 * Run `change` with a page open on the shared server. A dev server that follows
 * the route tree restarts when a route appears or goes away, and Vite's client
 * reloads every open page once the new server is up. That reload is the signal
 * that the swap is over, so `change` receives it as a promise.
 */
async function holdPageOnSharedServer(
  browser: Browser,
  change: (reloaded: Promise<void>) => Promise<void>,
): Promise<void> {
  await waitForServer(SHARED_DEV_SERVER);
  const page = await browser.newPage();
  try {
    await page.goto(SHARED_DEV_SERVER);
    await change(new Promise((resolve) => page.once("load", () => resolve())));
  } finally {
    await page.close();
  }
}

/**
 * Add a fixture route and return once the shared dev server has finished
 * reacting to it. Its restart re-optimizes dependencies into the
 * `node_modules/.vite` every dev server on the demo shares, which breaks a page
 * loading from a server the spec starts meanwhile.
 *
 * Only a server following the route tree renders `routeUrl` (the route's flight
 * url). A server that doesn't will not restart either, and never answers, so
 * that case ends when the watcher has had time to notice.
 */
export async function addRouteToSharedServer(
  browser: Browser,
  routeUrl: string,
  add: () => Promise<void>,
): Promise<void> {
  await holdPageOnSharedServer(browser, async (reloaded) => {
    await add();
    const deadline = Date.now() + ROUTE_SCAN_WINDOW_MS;
    while (Date.now() < deadline) {
      if (await answersFlight(SHARED_DEV_SERVER + routeUrl)) {
        await reloaded;
        return;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  });
}

/**
 * Delete a fixture route and return once the shared dev server has finished
 * reacting to it. Landing in a later spec, its reload would wipe the client
 * state that spec is checking. A server that doesn't render `routeUrl` while the
 * route exists never picked it up and has nothing to react to.
 */
export async function removeRouteFromSharedServer(
  browser: Browser,
  routeUrl: string,
  remove: () => Promise<void>,
): Promise<void> {
  if (!(await answersFlight(SHARED_DEV_SERVER + routeUrl))) {
    await remove();
    return;
  }
  await holdPageOnSharedServer(browser, async (reloaded) => {
    await remove();
    await reloaded;
  });
}
