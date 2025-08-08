import type { Logger } from "vite";
import type { Worker } from "node:worker_threads";
import type { ViteDevServer } from "vite";
import { handleError } from "../error/handleError.js";
import { getNodeEnv } from "../config/getNodeEnv.js";

export interface WorkerStreamHandlerOptions {
  worker: Worker | ViteDevServer;
  route: string;
  timeout: number;
  signal?: AbortSignal;
  verbose?: boolean;
  panicThreshold?: "none" | "critical_errors" | "all_errors";
  logger: Logger;
  context?: string;
  onMessage: (message: any) => void;
  onError?: (error: unknown) => void;
  onComplete?: () => void;
}

export interface WorkerStreamHandlerResult {
  promise: Promise<void>;
  cleanup: () => void;
}

/**
 * Creates a worker stream handler that manages worker communication, timeouts, and cleanup.
 * This abstracts the common pattern used across the plugin for worker-based streaming.
 */
export function createWorkerStreamHandler(options: WorkerStreamHandlerOptions): WorkerStreamHandlerResult {
  const {
    worker,
    route,
    timeout,
    signal,
    verbose = false,
    panicThreshold = "none",
    logger,
    context = "createWorkerStreamHandler",
    onMessage,
    onError,
    onComplete
  } = options;

  if (!("postMessage" in worker)) {
    throw new Error("Worker is not a valid worker");
  }

  let finished = false;
  let errorTimeout: NodeJS.Timeout | null = null;
  let generalTimeout: NodeJS.Timeout | null = null;
  let messageHandler: ((msg: any) => void) | null = null;

  const promise = new Promise<void>((resolve, reject) => {
    // Add a general timeout to prevent hanging indefinitely
    generalTimeout = setTimeout(() => {
      if (!finished) {
        if (verbose) {
          logger.info(`[${context}:${route}] General timeout reached, rejecting`);
        }
        reject(new Error(`Route processing timeout for ${route}`));
      }
    }, timeout);

    // Listen for abort signal
    if (signal) {
      signal.addEventListener("abort", () => {
        if (verbose) {
          logger.info(`[${context}:${route}] Abort signal received, canceling build`);
        }

        // Clear any pending timeouts
        if (errorTimeout) {
          clearTimeout(errorTimeout);
          errorTimeout = null;
        }
        if (generalTimeout) {
          clearTimeout(generalTimeout);
          generalTimeout = null;
        }

        if (!finished) {
          finished = true;
          reject(new Error(`Build cancelled (${signal.reason || "abort signal"})`));
        }
      });
    }

    // Create message handler
    messageHandler = (msg: any) => {
      try {
        // Clear error timeout on any message
        if (errorTimeout) {
          clearTimeout(errorTimeout);
          errorTimeout = null;
        }

        // Call the provided message handler
        onMessage(msg);
      } catch (error) {
        const panicError = handleError({
          error,
          logger,
          mode: getNodeEnv(),
          panicThreshold,
          context,
        });
        
        if (panicError != null) {
          if (!finished) {
            finished = true;
            reject(panicError);
          }
          return;
        }

        // Set error timeout for non-panic errors
        errorTimeout = setTimeout(() => {
          if (!finished) {
            if (verbose) {
              logger.info(`[${context}:${route}] Error timeout reached, rejecting`);
            }
            finished = true;
            reject(new Error(`Error timeout for ${route}`));
          }
        }, 5000); // 5 second error timeout
      }
    };

    // Attach message handler to worker
    worker.on("message", messageHandler);

    // Handle worker errors
    worker.on("error", (error) => {
      onError?.(error);
      if (!finished) {
        finished = true;
        const panicError = handleError({
          error,
          logger,
          mode: getNodeEnv(),
          panicThreshold,
          context,
        });
        
        if (panicError != null) {
          reject(panicError);
        } else {
          reject(error);
        }
      }
    });

    // Handle worker exit
    worker.on("exit", (code) => {
      if (!finished) {
        finished = true;
        if (code !== 0) {
          reject(new Error(`Worker exited with code ${code}`));
        } else {
          resolve();
        }
      }
    });
  });

  const cleanup = () => {
    if (messageHandler) {
      worker.off("message", messageHandler);
      messageHandler = null;
    }
    
    if (errorTimeout) {
      clearTimeout(errorTimeout);
      errorTimeout = null;
    }
    
    if (generalTimeout) {
      clearTimeout(generalTimeout);
      generalTimeout = null;
    }

    if (onComplete) {
      onComplete();
    }
  };

  return { promise, cleanup };
} 