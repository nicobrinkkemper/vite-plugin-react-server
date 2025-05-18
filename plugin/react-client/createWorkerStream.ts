import type { Logger } from "vite";
import type {
  RscWorkerOutputMessage,
  RscRenderMessage,
} from "../worker/types.js";
import type { StreamMetrics } from "../types.js";
import type { Worker as NodeWorker } from "node:worker_threads";
import type { StreamHandlers } from "../worker/types.js";
import { createMessageHandler } from "./createMessageHandlers.js";

/**
 * Creates an async generator that yields RSC chunks from the worker.
 * Handles both module requests and RSC streaming.
 *
 * @param worker - The worker thread
 * @param server - The Vite dev server
 * @param message - The RSC render message
 * @param rscWorkerLoaderPort - Optional loader port for module loading
 * @returns An async generator that yields RSC chunks
 */
export async function* createWorkerStream({
  worker,
  message,
  logger,
  handlers: { onHmrAccept, onHmrUpdate, onMetrics, onError, onData, onEnd },
  verbose = false,
}: {
  worker: NodeWorker;
  message: Omit<RscRenderMessage, "type" | "id">;
  logger: Logger;
  handlers: Pick<StreamHandlers, "onHmrAccept" | "onHmrUpdate" | "onMetrics"> &
    Partial<Pick<StreamHandlers, "onError" | "onData" | "onEnd">>;
  verbose?: boolean;
}): AsyncGenerator<Uint8Array> {
  let messageHandler:
    | ((message: RscWorkerOutputMessage | undefined) => void)
    | null = null;
  let currentResolve: ((chunk: Uint8Array) => void) | null = null;
  const handlers: StreamHandlers = {
    onError: (error: any, errorInfo?: any) => {
      logger.error(
        "[react-client] " +
          (error.stack ?? error.stack.includes(error.message) ? "" : error.message + "\n") +
          error.stack,
        {
          error,
        }
      );
      if (errorInfo) {
        logger.error(errorInfo.componentStack);
      }
      if (typeof onError === "function") {
        onError(error, errorInfo);
      }
    },
    onData: (chunk: Uint8Array) => {
      currentResolve?.(chunk);
      if (verbose) logger.info(`received chunk ${chunk.length} bytes`);
      if (typeof onData === "function") {
        onData(chunk);
      }
    },
    onEnd: () => {
      currentResolve?.(new Uint8Array());
      if (verbose) logger.info(`received end`);
      if (messageHandler) {
        worker.removeListener("message", messageHandler);
        messageHandler = null;
      }
      if (typeof onEnd === "function") {
        onEnd();
      }
    },
    onMetrics: (metrics: StreamMetrics) => {
      if (verbose) logger.info(`received chunks ${metrics.chunks}`);
      if (typeof onMetrics === "function") {
        onMetrics(metrics);
      }
    },
    onHmrAccept: (routes: string[]) => {
      if (verbose) logger.info(`received hmr accept ${routes.join(", ")}`);
      if (typeof onHmrAccept === "function") {
        onHmrAccept(routes);
      }
    },
    onHmrUpdate: (routes: string[]) => {
      if (verbose) logger.info(`received hmr update ${routes.join(", ")}`);
      if (typeof onHmrUpdate === "function") {
        onHmrUpdate(routes);
      }
    },
  };

  try {
    // Remove any existing message handler before starting
    if (messageHandler) {
      worker.removeListener("message", messageHandler);
      messageHandler = null;
    }
    if (verbose) logger.info(`sending message RSC_RENDER`);
    worker.postMessage({
      ...message,
      type: "RSC_RENDER",
      id: Math.random().toString(36).slice(2),
    });

    if (verbose) logger.info(`waiting for message handler`);
    let workerTimeout: NodeJS.Timeout | null = null;
    yield await new Promise<Uint8Array>((resolve) => {
      workerTimeout = setTimeout(() => {
        if (verbose) logger.info(`worker timeout`);
        worker.terminate();
      }, 5000);
      currentResolve = resolve;
      messageHandler = createMessageHandler({
        handlers,
        logger,
        verbose,
      });
      worker.on("message", messageHandler);
    });
    if (workerTimeout) {
      clearTimeout(workerTimeout);
    }
    if (verbose) logger.info(`received message handler`);
    while (true) {
      const chunk = await new Promise<Uint8Array>((resolve) => {
        currentResolve = resolve;
        // Create new message handler for each iteration
        if (messageHandler) {
          worker.removeListener("message", messageHandler);
        }
        messageHandler = createMessageHandler({
          handlers,
          logger,
          verbose,
        });
        worker.on("message", messageHandler);
      });

      if (chunk.length === 0) {
        break;
      }

      yield chunk;
    }
  } finally {
    // Clean up message handler in finally block
    if (messageHandler) {
      worker.removeListener("message", messageHandler);
      messageHandler = null;
    }
    handlers.onEnd();
  }
}
