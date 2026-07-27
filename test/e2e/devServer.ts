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
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

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
