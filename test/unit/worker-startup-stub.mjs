// Stub worker for the startup-watchdog stress test (worker-startup-watchdog.test.ts).
// Lives in test/unit (not test/fixtures, which is gitignored) because it must be
// a committed file the worker thread loads by path. It deliberately does NOT
// import React/vite — it just reproduces the timing shape of a real worker: the
// thread comes 'online' (Node emits that the instant the script starts), then
// spends `stubBusyMs` synchronously blocked (standing in for the cold import of
// `vite` into a fresh isolate), and only then signals READY.
//
// With `stubSilent: true` it comes online but never signals ready and never
// exits — a genuinely hung startup, which the inactivity watchdog should still
// catch.
import { parentPort, workerData } from "node:worker_threads";

const busyMs = Number(workerData?.stubBusyMs ?? 0);
const silent = workerData?.stubSilent === true;

if (busyMs > 0) {
  const end = Date.now() + busyMs;
  // Busy-block the worker thread, exactly like a synchronous module evaluation.
  while (Date.now() < end) {
    /* spin */
  }
}

if (silent) {
  // Stay alive but never post READY (and never exit) → simulate a real hang.
  setInterval(() => {}, 1000);
} else {
  parentPort?.postMessage({
    type: "READY",
    env: process.env.NODE_ENV,
    pid: process.pid,
    // createWorker sets workerData.id to its own computed id ("worker/rsc" here)
    // when the caller doesn't pass one, and matches READY against that id.
    id: workerData?.id ?? "worker/rsc",
  });
}
