import type {
  RscWorkerOutputMessage,
} from "../worker/rsc/types.js";
import type { StreamMetrics } from "../types.js";
import type { StreamHandlers } from "../worker/types.js";
import { createMessageHandler } from "./createMessageHandlers.js";
import type { CreateWorkerStreamFn } from "./types.js";

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
export const createWorkerStream: CreateWorkerStreamFn = async function* _createWorkerStream({
  worker,
  message,
  logger,
  handlers: {
    onHmrAccept,
    onHmrUpdate,
    onMetrics,
    onError,
    onServerAction,
    onServerActionResponse,
    onCssFile,
  },
  verbose = false,
  rscTimeout = 5000,
}) {
  if (!worker) {
    throw new Error("Worker is not running");
  }
  let messageHandler:
    | ((message: RscWorkerOutputMessage | undefined) => void)
    | null = null;
  let currentResolve: ((chunk: Uint8Array | null) => void) | null = null;
  // let isStreamClosed = false;
  const handlers: StreamHandlers = {
    onError: (id, error, errorInfo) => {
      // isStreamClosed = true;
      if (typeof onError === "function") {
        onError(id, error, errorInfo);
      }
    },
    onData: (id: string, chunk: Uint8Array) => {
      // Handle generator flow - resolve the current promise with the chunk
      // Continue processing chunks even when there are errors to include error entries
      if (currentResolve) {
        currentResolve(chunk);
        currentResolve = null;
      }
      if (verbose) {
        logger.info(
          `[react-client] received chunk ${id} ${
            Buffer.from(chunk).byteLength
          } bytes`
        );
      }
    },
    onEnd: () => {
      // Handle generator flow - resolve with null to signal end
      if (currentResolve) {
        currentResolve(null);
        currentResolve = null;
      }
      // isStreamClosed = true;
      if (verbose) logger.info(`[react-client] received end`);
      if (messageHandler) {
        worker.removeListener("message", messageHandler);
        messageHandler = null;
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
    onCssFile: (id: string, code: string) => {
      if (verbose) logger.info(`[react-client] received css file ${id}`);
      if (typeof onCssFile === "function") {
        onCssFile(id, code);
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
    const initialChunk = await new Promise<Uint8Array | null>((resolve) => {
      workerTimeout = setTimeout(() => {
        if (verbose) logger.info(`worker timeout`);
        worker.terminate();
      }, rscTimeout);
      currentResolve = (chunk: Uint8Array | null) => {
        resolve(chunk);
      };
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
    
    // Only yield the initial chunk if it's not null
    if (initialChunk !== null) {
      yield initialChunk;
    }
    
    while (true) {
      const chunk = await new Promise<Uint8Array | null>((resolve) => {
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

      if (chunk === null) {
        break; // End of stream
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
