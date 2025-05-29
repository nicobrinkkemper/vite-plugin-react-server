import type { Logger } from "vite";
import type {
  RscWorkerOutputMessage,
  RscRenderMessage,
} from "../worker/types.js";
import type { StreamMetrics } from "../types.js";
import type { Worker as NodeWorker } from "node:worker_threads";
import type { StreamHandlers } from "../worker/types.js";
import { createMessageHandler } from "./createMessageHandlers.js";
import { logError } from "../error/toError.js";

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
  handlers: {
    onHmrAccept,
    onHmrUpdate,
    onMetrics,
    onError,
    onData,
    onEnd,
    onServerAction,
    onServerActionResponse,
  },
  verbose = false,
}: {
  worker: NodeWorker;
  message: Omit<RscRenderMessage, "type" | "id"> &
    Partial<Pick<RscRenderMessage, "id">> & { type?: "RSC_RENDER" };
  logger: Logger;
  handlers: Pick<StreamHandlers, "onHmrAccept" | "onHmrUpdate" | "onMetrics"> &
    Partial<
      Pick<
        StreamHandlers,
        | "onError"
        | "onData"
        | "onEnd"
        | "onServerAction"
        | "onServerActionResponse"
      >
    >;
  verbose?: boolean;
}): AsyncGenerator<Uint8Array> {
  if (!worker) {
    throw new Error("Worker is not running");
  }
  let messageHandler:
    | ((message: RscWorkerOutputMessage | undefined) => void)
    | null = null;
  let currentResolve: ((chunk: Uint8Array) => void) | null = null;
  const handlers: StreamHandlers = {
    onError: (id, error, errorInfo) => {
      logError(error, logger);
      if (errorInfo) {
        logError(errorInfo.componentStack, logger);
      }
      if (typeof onError === "function") {
        onError(id, error, errorInfo);
      }
    },
    onData: (id: string, chunk: Uint8Array) => {
      currentResolve?.(chunk);
      if (verbose) {
        logger.info(
          `[react-client] received chunk ${id} ${
            Buffer.from(chunk).byteLength
          } bytes`
        );
      }
      if (typeof onData === "function") {
        onData(id, chunk);
      }
    },
    onEnd: (id: string) => {
      currentResolve?.(new Uint8Array());
      if (verbose) logger.info(`[react-client] received end`);
      if (messageHandler) {
        worker.removeListener("message", messageHandler);
        messageHandler = null;
      }
      if (typeof onEnd === "function") {
        onEnd(id);
      }
    },
    onMetrics: (id: string, metrics: StreamMetrics) => {
      if (verbose)
        logger.info(`[react-client] received chunks ${metrics.chunks}`);
      if (typeof onMetrics === "function") {
        onMetrics(id, metrics);
      }
    },
    onHmrAccept: (id: string, routes?: string[]) => {
      if (verbose)
        logger.info(`[react-client] received hmr accept ${routes?.join(", ")}`);
      if (typeof onHmrAccept === "function") {
        onHmrAccept(id, routes);
      }
    },
    onHmrUpdate: (id: string, routes?: string[]) => {
      if (verbose)
        logger.info(`[react-client] received hmr update ${routes?.join(", ")}`);
      if (typeof onHmrUpdate === "function") {
        onHmrUpdate(id, routes);
      }
    },
    onServerAction: (id: string, args: unknown[]) => {
      if (verbose) logger.info(`[react-client] received server action ${id}`);
      if (typeof onServerAction === "function") {
        onServerAction(id, args);
      }
    },
    onServerActionResponse: (id: string, result?: unknown, error?: string) => {
      if (verbose)
        logger.info(`[react-client] received server action response ${id}`);
      if (typeof onServerActionResponse === "function") {
        onServerActionResponse(id, result, error);
      }
    },
  };

  try {
    // Remove any existing message handler before starting
    if (messageHandler) {
      worker.removeListener("message", messageHandler);
      messageHandler = null;
    }
    if (verbose) logger.info(`[react-client] sending message RSC_RENDER`);
    worker.postMessage({
      ...message,
      type: "RSC_RENDER",
      id: message?.id ?? message.route,
    });

    if (verbose) logger.info(`[react-client] waiting for message handler`);
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
    if (verbose) logger.info(`[react-client] received message handler`);
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
  }
}
