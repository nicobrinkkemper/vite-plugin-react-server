/**
 * Stress + behaviour coverage for the worker-startup handshake in
 * createWorker.ts. The startup deadline is an INACTIVITY watchdog: it re-arms
 * on the worker's `online` event and on every message, so spawn-queue latency
 * under heavy parallel load no longer counts against a healthy-but-slow worker.
 * Genuine hangs (online but then silent) still fail.
 *
 * These drive the real createWorker against a stub worker that reproduces the
 * timing shape of a cold start (comes online, then blocks for a while) without
 * pulling in React/vite.
 */
import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
// Spawns REAL worker threads, so it runs against the BUILT createWorker — the
// worker's `--import register-vendor.js` only resolves from dist. Gated behind
// VPRS_WORKER_STRESS so it only runs after a fresh build (the `test:worker-
// startup` script), never against stale dist in the regular suite.
import { createWorker } from "../../dist/plugin/worker/createWorker.js";

const RUN = process.env["VPRS_WORKER_STRESS"] === "1";

const stubPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "worker-startup-stub.mjs"
);

const silentLogger = { info() {}, warn() {}, error() {} } as never;

function spawnStub(workerData: Record<string, unknown>) {
  return createWorker({
    workerPath: stubPath,
    // Force the rsc id so the stub's READY id matches regardless of the
    // condition the test file runs under.
    reverseCondition: "react-server",
    logger: silentLogger,
    workerData,
  } as never) as Promise<
    | { type: "success"; worker: { terminate(): Promise<number> } }
    | { type: "error"; error: Error }
    | { type: "skip" }
  >;
}

async function terminate(
  results: Array<{ type: string; worker?: { terminate(): Promise<number> } }>
) {
  await Promise.all(
    results.map((r) => (r.type === "success" ? r.worker!.terminate() : null))
  );
}

describe.skipIf(!RUN)("worker startup watchdog", () => {
  it("starts many workers concurrently under load without spurious timeouts", async () => {
    // 16 workers spawned at once, each blocking ~800ms — heavy contention that
    // would push some past a fixed 3s-from-spawn deadline on a busy machine.
    const N = 16;
    const results = await Promise.all(
      Array.from({ length: N }, () => spawnStub({ stubBusyMs: 800 }))
    );
    try {
      for (const r of results) expect(r.type).toBe("success");
    } finally {
      await terminate(results);
    }
  }, 30000);

  it("does not kill a slow-but-alive worker that blocks well past the old 3s deadline", async () => {
    const r = await spawnStub({ stubBusyMs: 4000 });
    try {
      expect(r.type).toBe("success");
    } finally {
      await terminate([r]);
    }
  }, 20000);

  it("still fails a worker that comes online but never signals ready", async () => {
    const r = await spawnStub({
      stubSilent: true,
      userOptions: { rscWorkerStartupTimeout: 600 },
    });
    expect(r.type).toBe("error");
    if (r.type === "error") {
      expect(String(r.error?.message)).toMatch(/timeout/i);
    }
  }, 15000);

  it("a boot-shim worker heartbeating through a load LONGER than the timeout still starts", async () => {
    // The real flake shape: the worker entry's heavy import graph evaluates
    // past the startup window under CPU contention. The boot shim
    // (bootWorker.ts) posts BOOTING between load stages; each message must
    // re-arm the watchdog AND must not consume the parent's READY listener
    // (a `once` listener is eaten by the first heartbeat — the regression
    // this test pins). 4×400ms busy chunks with heartbeats between, against
    // a 600ms startup timeout: total load 1600ms > 600ms, but no silent gap
    // exceeds the window.
    const r = await spawnStub({
      stubBootChunks: 4,
      stubBootChunkMs: 400,
      userOptions: { rscWorkerStartupTimeout: 600 },
    });
    try {
      expect(r.type).toBe("success");
    } finally {
      await terminate([r as never]);
    }
  }, 15000);
});
