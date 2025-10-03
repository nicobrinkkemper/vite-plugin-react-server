import type { Worker, MessagePort } from "node:worker_threads";

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

/**
 * Safely cleans up MessagePorts with consistent error handling
 */
export function cleanupMessagePorts(
  ports: (MessagePort | null | undefined)[],
  options: { logErrors?: boolean } = {}
): void {
  const { logErrors = false } = options;

  for (const port of ports) {
    if (!port) continue;

    try {
      // Remove onmessage handlers (property assignment cleanup)
      (port as any).onmessage = null;
      // Close the port
      port.close();
    } catch (error) {
      if (logErrors) {
        console.warn('[workerCleanup] Error during MessagePort cleanup:', error);
      }
      // Always ignore cleanup errors
    }
  }
}

/**
 * Comprehensive cleanup for worker + MessagePorts combination
 * This is the most common cleanup pattern in the codebase
 */
export function cleanupWorkerAndPorts(
  worker: Worker | null | undefined,
  ports: (MessagePort | null | undefined)[],
  options: WorkerCleanupOptions = {}
): void {
  cleanupMessagePorts(ports, { logErrors: options.logErrors });
  cleanupWorker(worker, options);
}
