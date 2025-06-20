import type { Logger } from "vite";
import type { RscRenderMessage } from "../worker/rsc/types.js";
import type { StreamHandlers } from "../worker/types.js";
import { createWorkerStream } from "./createWorkerStream.js";
import type { Worker as NodeWorker } from "node:worker_threads";
import { toError } from "../error/toError.js";

export type HandleWorkerRscStreamFn = (props: { 
  worker: NodeWorker;
  message: Omit<RscRenderMessage, "type" | "id"> &
    Partial<Pick<RscRenderMessage, "id">> & {
      type?: "RSC_RENDER";
    };
  logger: Logger;
  handlers: Pick<StreamHandlers, "onMetrics" | "onHmrAccept" | "onHmrUpdate"> & 
    Partial<
      Pick<
        StreamHandlers,
        | "onError"
        | "onData"
        | "onEnd"
        | "onServerAction"
        | "onServerActionResponse"
        | "onCssFile"
      >
    >;
  verbose?: boolean;
}) => ReadableStream<Uint8Array>;

/**
 * Handles the RSC stream from the worker.
 * Creates a ReadableStream that pipes RSC chunks to the response.
 *
 * @param worker - The worker thread
 * @param message - The RSC render message
 * @returns A ReadableStream that yields RSC chunks
 */
export const handleWorkerRscStream: HandleWorkerRscStreamFn = function _handleWorkerRscStream({
  worker,
  message,
  logger,
  handlers,
  verbose = false,
}) {
  // Create a ReadableStream from the async generator
  let isFlowing = false;
  let isClosed = false;
  let hasError = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const handleError = (error: unknown, errorInfo?: Record<string, unknown>) => {
        if (hasError) return; // Prevent double error handling
        hasError = true;
        const errorToThrow = toError(error);
        errorToThrow.message = `[react-client] ${errorToThrow.message}`;
        logger.error(errorToThrow.message);
        if (errorInfo) {
          logger.error(JSON.stringify(errorInfo));
        }
        if (!isClosed) {
          isClosed = true;
          try {
            controller.close();
          } catch {
            // Ignore errors from trying to close an already closed controller
          }
        }
      };

      try {
        if (verbose) logger.info("[react-client] Starting stream");
        
        // Pure generator approach - process chunks directly
        for await (const chunk of createWorkerStream({
          worker,
          message,
          logger,
          handlers: {
            // Only keep non-data handlers for side effects
            onMetrics: handlers.onMetrics,
            onHmrAccept: handlers.onHmrAccept,
            onHmrUpdate: handlers.onHmrUpdate,
            onServerAction: handlers.onServerAction,
            onServerActionResponse: handlers.onServerActionResponse,
            onCssFile: handlers.onCssFile,
            onError: (id: string, error: unknown, errorInfo?: Record<string, unknown>) => {
              handleError(error, errorInfo);
              if(handlers.onError) {
                handlers.onError(id, error, errorInfo);
              }
            }
          },
          verbose,
        })) {
          // Process chunks directly from generator
          if (!isFlowing) {
            isFlowing = true;
            if (verbose) logger.info("[react-client] Stream is flowing");
          }
          
          if (!isClosed && !hasError) {
            controller.enqueue(chunk);
          }
          
          // Call onData handler if provided
          if (handlers.onData) {
            handlers.onData(message?.id ?? message.route, chunk);
          }
        }
        
        // Stream ended naturally
        if (isFlowing) {
          isFlowing = false;
          if (verbose) logger.info("[react-client] Stream closing");
        }
        if (!isClosed && !hasError) {
          isClosed = true;
          controller.close();
        }
        
        // Call onEnd handler if provided
        if (handlers.onEnd) {
          handlers.onEnd(message?.id ?? message.route);
        }
        
      } catch (error) {
        handleError(error);
      }
    },
  });
}
