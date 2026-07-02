import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
// Import the BUILT worker entry (like the other worker-spawning tests): the
// worker's `--import` vendor-register path resolves relative to createWorker's
// own location and only exists under dist/.
import { createWorker } from "vite-plugin-react-server/worker";

// Regression for the zombie-worker leak: createWorker's startup watchdog
// rejected a worker that missed its window but did NOT terminate the thread, so
// a CPU-starved worker lingered — holding a thread and starving the next
// worker's startup, cascading one timeout into many across a parallel build
// suite. The fix terminates + deregisters the worker when the watchdog fires.

// A worker that NEVER sends READY (so the watchdog fires) and writes a marker
// LONG after the short startup timeout — only reachable if it wasn't terminated.
const WORKER_SRC = `
import { workerData } from "node:worker_threads";
import { writeFileSync } from "node:fs";
const marker = workerData?.leakMarker;
setTimeout(() => {
  try { if (marker) writeFileSync(marker, "zombie-alive"); } catch {}
}, 2000);
setInterval(() => {}, 1000);
`;

const workerPath = join(tmpdir(), `vprs-never-ready-worker-${process.pid}.mjs`);

let marker = "";
beforeAll(() => writeFileSync(workerPath, WORKER_SRC));
afterAll(() => rmSync(workerPath, { force: true }));
afterEach(() => {
  if (marker) rmSync(marker, { force: true });
});

describe("worker startup watchdog", () => {
  it("terminates a worker that misses its startup window (no zombie left behind)", async () => {
    marker = join(tmpdir(), `vprs-zombie-${process.pid}-${performance.now()}.marker`);

    // A short startup timeout + a worker that never sends READY → the watchdog
    // fires. The worker writes `marker` 2s later ONLY if it is still alive.
    const result = await createWorker({
      workerPath,
      currentCondition: "react-client",
      reverseCondition: "react-server",
      workerData: {
        userOptions: { rscWorkerStartupTimeout: 500 },
        leakMarker: marker,
      },
    } as any);

    // It timed out (did not become READY).
    expect(result.type).not.toBe("success");
    expect(String((result as any).error?.message ?? "")).toMatch(
      /ready timeout/i
    );

    // Wait past the worker's 2s "still alive" write. A terminated worker never
    // runs that callback, so the marker must NOT exist. Before the fix, the
    // zombie survives and writes it.
    await new Promise((r) => setTimeout(r, 2600));
    expect(existsSync(marker)).toBe(false);
  }, 15000);
});
