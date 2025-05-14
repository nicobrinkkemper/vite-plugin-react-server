import type { Logger } from "vite";
import type { RscWorkerOutputMessage, RscRenderMessage } from "../worker/types.js";
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
export async function* createWorkerStream(
  worker: NodeWorker,
  message: Omit<RscRenderMessage, "type" | "id">,
  logger: Logger,
  onMetrics?: (metrics: StreamMetrics) => void
): AsyncGenerator<Uint8Array> {
  let messageHandler: ((message: RscWorkerOutputMessage | undefined) => void) | null = null;
  let currentResolve: ((chunk: Uint8Array) => void) | null = null;
  const handlers: StreamHandlers = {
    onError: (error: any, errorInfo?: any) => {
      logger.error(error.message + error.stack, {
        error,
      });
      if (errorInfo) {
        logger.error(errorInfo.componentStack);
      }
    },
    onData: (chunk: Uint8Array) => {
      currentResolve?.(chunk);
    },
    onEnd: () => {
      currentResolve?.(new Uint8Array());
      if (messageHandler) {
        worker.removeListener("message", messageHandler);
        messageHandler = null;
      }
    },
    onMetrics: (metrics: StreamMetrics) => {
      onMetrics?.(metrics);
    },
  };

  try {
    // Remove any existing message handler before starting
    if (messageHandler) {
      worker.removeListener("message", messageHandler);
      messageHandler = null;
    }

    worker.postMessage({
      ...message,
      type: "RSC_RENDER",
      id: Math.random().toString(36).slice(2),
    });

    yield await new Promise<Uint8Array>((resolve) => {
      currentResolve = resolve;
      messageHandler = createMessageHandler({
        handlers,
        logger,
      });
      worker.on("message", messageHandler);
    });

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
