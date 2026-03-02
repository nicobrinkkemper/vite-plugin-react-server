import type { Worker } from "node:worker_threads";

/**
 * Centralized worker cleanup utilities
 * Provides consistent cleanup patterns across the codebase
 */

export interface WorkerCleanupOptions {
  /** Whether to terminate the worker (default: true) */
  terminate?: boolean;
  /** Whether to remove all listeners (default: true) */
  removeListeners?: boolean;
  /** Whether to log cleanup errors (default: false) */
  logErrors?: boolean;
}

/**
 * Safely cleans up a worker with consistent error handling
 */
export function cleanupWorker(
  worker: Worker | null | undefined,
  options: WorkerCleanupOptions = {}
): void {
  if (!worker) return;

  const {
    terminate = true,
    removeListeners = true,
    logErrors = false
  } = options;

  try {
    if (removeListeners) {
      worker.removeAllListeners();
    }
    
    if (terminate) {
      worker.terminate();
    }
  } catch (error) {
    if (logErrors) {
      console.warn('[workerCleanup] Error during worker cleanup:', error);
    }
    // Always ignore cleanup errors to prevent cascading failures
  }
}


