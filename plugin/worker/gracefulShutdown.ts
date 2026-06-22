import type { Worker } from "node:worker_threads";

export interface GracefulShutdownOptions {
  /** Main shutdown timeout (ms). A backup timeout fires at 60% of this. */
  timeoutMs: number;
  logger?: { info?: (msg: string) => void; warn?: (msg: string) => void };
  verbose?: boolean;
  /**
   * Await `worker.terminate()` before resolving. The client static build needs
   * this: libuv handles still pending in the worker at exit (file reads/writes)
   * can otherwise fire AFTER doBuild restores cwd, producing post-teardown
   * ENOENT errors against relative paths. See bd-6pi. Default false (the server
   * build doesn't restore cwd under the worker, so a sync terminate is fine).
   */
  awaitTerminate?: boolean;
  /** Called if the graceful protocol times out / errors, before force-terminate. */
  onProtocolFail?: (error: unknown) => void;
}

/**
 * Ask a worker to shut down gracefully, then force-terminate.
 *
 * Sends `{ type: "SHUTDOWN", id: "*" }` and waits for `SHUTDOWN_COMPLETE`; a
 * main + 60%-backup timeout bounds the wait. On success or failure the worker's
 * listeners are removed and it is terminated. Resolves once teardown is done.
 *
 * This consolidates the (near-)identical choreography that lived in the server-
 * and client-static plugins' closeBundle/finally paths — the most fragile,
 * race-prone code in the build, so it is worth having exactly once.
 */
export async function gracefulWorkerShutdown(
  worker: Worker,
  options: GracefulShutdownOptions
): Promise<void> {
  const { timeoutMs, logger, verbose, awaitTerminate, onProtocolFail } = options;

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Worker shutdown timeout")),
        timeoutMs
      );
      const backupTimeout = setTimeout(
        () => reject(new Error("Worker shutdown backup timeout")),
        Math.floor(timeoutMs * 0.6)
      );

      const messageHandler = (message: any) => {
        if (message?.type === "SHUTDOWN_COMPLETE") {
          if (verbose) logger?.info?.("Worker shutdown complete");
          clearTimeout(timeout);
          clearTimeout(backupTimeout);
          worker.removeListener("message", messageHandler);
          worker.removeAllListeners();
          resolve();
        } else if (message?.type === "CLEANUP_COMPLETE") {
          // Normal during shutdown — keep waiting for SHUTDOWN_COMPLETE.
          if (verbose) logger?.info?.("Worker cleanup completed during shutdown");
        } else if (verbose) {
          logger?.info?.("Worker is still busy, received message " + message?.type);
        }
      };

      worker.on("message", messageHandler);
      worker.postMessage({ type: "SHUTDOWN", id: "*" });
    });
  } catch (error) {
    onProtocolFail?.(error);
  } finally {
    try {
      worker.removeAllListeners();
      if (awaitTerminate) {
        await worker.terminate();
      } else {
        worker.terminate();
      }
    } catch {
      // Ignore termination errors.
    }
  }
}
