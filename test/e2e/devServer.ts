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

/**
 * Delete a fixture route and return once the shared dev server has finished
 * reacting to it.
 *
 * A dev server that follows the route tree restarts when a route goes away,
 * and Vite's client reloads every open page once the new server is up. Landing
 * in a later spec, that reload wipes the client state the spec is checking. So
 * a page is held open across the removal, and its reload is the signal that the
 * swap is over. A server that never picked the route up has nothing to react
 * to: `routeUrl` (the route's flight url) tells the two apart, because only a
 * server following the tree renders it while the route exists.
 */
export async function removeRouteFromSharedServer(
  browser: Browser,
  routeUrl: string,
  remove: () => Promise<void>,
): Promise<void> {
  await waitForServer(SHARED_DEV_SERVER);
  const flight = await fetch(SHARED_DEV_SERVER + routeUrl, {
    headers: { Accept: "text/x-component" },
  });
  if (!flight.ok) {
    await remove();
    return;
  }
  const page = await browser.newPage();
  try {
    await page.goto(SHARED_DEV_SERVER);
    await Promise.all([page.waitForEvent("load"), remove()]);
  } finally {
    await page.close();
  }
}
