import { parentPort } from "node:worker_threads";

/**
 * Startup liveness for the inactivity watchdog in createWorker.
 *
 * The parent re-arms its startup timer on the worker's `online` event and on
 * every message — but a worker entry's heavy import graph (the message
 * handler pulls the whole render pipeline) evaluates in SILENCE between
 * `online` and the final READY. Under CPU contention that silence can exceed
 * the watchdog window even though the worker is making steady progress: the
 * verify-gate flake, "Worker ready timeout after 10000ms of inactivity".
 *
 * So the worker entries are thin boot shims that post BOOTING immediately
 * and heartbeat every second while the implementation module loads. Module
 * loading yields to the event loop on file I/O, so the interval genuinely
 * fires while a starved-but-alive worker loads — the watchdog then only
 * fires on true silence (a dead or wedged worker), which is what its name
 * promises. The interval is unref'd (it must never keep the thread alive)
 * and cleared as soon as the import settles; the implementation posts READY
 * itself during its evaluation, exactly as before.
 *
 * BOOTING is deliberately NOT part of the worker message unions: the only
 * intended consumer is createWorker's startup activity listener, which
 * treats any message as a sign of life and ignores everything but READY.
 */
export async function bootWorker(
  id: string,
  load: () => Promise<unknown>
): Promise<void> {
  const beat = () => {
    try {
      parentPort?.postMessage({ type: "BOOTING", id });
    } catch {
      // A closing port must never turn a liveness signal into a crash.
    }
  };
  beat();
  const heartbeat = setInterval(beat, 1_000);
  heartbeat.unref?.();
  try {
    await load();
  } finally {
    clearInterval(heartbeat);
  }
}
