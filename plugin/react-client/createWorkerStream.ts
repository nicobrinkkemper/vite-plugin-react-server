import type { Logger } from "vite";
import type { RscRenderMessage, RscWorkerOutputMessage } from "../worker/types.js";
import type { StreamMetrics } from "../../types.js";
import { Worker } from "node:worker_threads";
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
    worker: Worker,
    message: Omit<RscRenderMessage, "type" | "id">,
    logger: Logger,
    onMetrics?: (metrics: StreamMetrics) => void
  ): AsyncGenerator<Uint8Array, void, unknown> {
    let messageHandler: (message: RscWorkerOutputMessage) => void;
    let cleanup: () => void = () => {};
    let onError = (error: any) => {
      let err;
      if (typeof error === "string") {
        err = new Error(error);
      } else if (typeof error === "object" && error != null) {
        const stackTrace = "stack" in error ? String(error.stack) : "";
        const msg = "message" in error ? String(error.message) : "";
        err = {
          message: msg,
          stack: stackTrace,
        }
      } else {
        err = new Error("Failed to load page content");
      }
      // Format the error using the worker's error details
      return new TextEncoder().encode(`0:E{"digest":"","name":"Error","message":"${
        err.message
      }","stack":${JSON.stringify(err.stack)},"env":"Server"}`);
    };
    // First yield: wait for initial message and handle module requests
    yield await new Promise<Uint8Array>((resolve) => {
      messageHandler = (message: RscWorkerOutputMessage) => {
        switch (message.type) {
          case "RSC_CHUNK":
            resolve(message.chunk);
            break;
          case "RSC_END":
            resolve(new Uint8Array());
            break;
          case "ERROR":
            const errorResponse = onError(message.error);
            resolve(errorResponse);
            break;
          default:
            logger.warn(`Unknown initial message type: ${message.type}`);
            resolve(new Uint8Array());
            break;
        }
      };
  
      cleanup = () => {
        worker.off("message", messageHandler);
      };
  
      worker.on("message", messageHandler);
  
      // Send the render message to start the RSC stream
      worker.postMessage({
        type: "RSC_RENDER",
        id: message.route,
        ...message,
      });
    });
  
    // Subsequent yields: handle RSC chunks until stream ends
    while (true) {
      const chunk = await new Promise<Uint8Array>((resolve) => {
        messageHandler = (message: RscWorkerOutputMessage) => {
          switch (message.type) {
            case "RSC_END":
              cleanup();
              resolve(new Uint8Array());
              return;
            case "RSC_CHUNK":
              resolve(message.chunk);
              return;
            case "RSC_METRICS":
              onMetrics?.(message.metrics);
              break;
            case "ERROR":
              cleanup();
              const errorResponse = onError(message.error);
              resolve(errorResponse);
              return;
          }
        };
        worker.once("message", messageHandler);
      });
  
      if (chunk.length === 0) {
        break;
      }
      yield chunk;
    }
  }