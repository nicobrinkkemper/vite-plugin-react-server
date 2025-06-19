import type { Logger } from "vite";
import type { RscRenderMessage } from "../worker/rsc/types.js";
import type { StreamHandlers } from "../worker/types.js";
import { createWorkerStream } from "./createWorkerStream.js";
import type { Worker as NodeWorker } from "node:worker_threads";
import type { AsOpt, InlineCssOpt, PageName, PagePropOpt, PropsName } from "../types.js";
import { toError } from "../error/toError.js";

export type HandleWorkerRscStreamFn = <
  T extends PagePropOpt = PagePropOpt,
  InlineCSS extends InlineCssOpt = InlineCssOpt,
  As extends AsOpt = AsOpt,
  N1 extends string = PageName,
  N2 extends string = PropsName
>(props: { 
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
          } catch (e) {
            // Ignore errors from trying to close an already closed controller
          }
        }
      };

      try {
        if (verbose) logger.info("[react-client] Starting stream");
        for await (const chunk of createWorkerStream({
          worker,
          message,
          logger,
          handlers: {
            ...handlers,
            onServerAction: (id: string, args: unknown[]) => {
              if (verbose)
                logger.info(
                  `[react-client] Forwarding server action ${id} to worker`
                );
              if(handlers.onServerAction) {
                handlers.onServerAction(id, args);
              }
            },
            onServerActionResponse: (
              id: string,
              result?: unknown,
              error?: string
            ) => {
              if (verbose)
                logger.info(
                  `[react-client] Forwarding server action response ${id} from worker`
                );
              if (typeof handlers.onServerActionResponse === "function") {
                // Ensure consistent response format
                const response = {
                  type: "server-action-response",
                  returnValue: error ? { success: false, error } : result,
                };
                handlers.onServerActionResponse(id, response);
              }
            },
            onData: (id: string, chunk: Uint8Array) => {
              if (!isFlowing) {
                isFlowing = true;
                if (verbose) logger.info("[react-client] Stream is flowing");
              }
              if (!isClosed && !hasError) {
                controller.enqueue(chunk);
              }
              if(handlers.onData) {
                handlers.onData(id, chunk);
              }
            },
            onEnd: (id: string) => {
              if (isFlowing) {
                isFlowing = false;
                if (verbose) logger.info("[react-client] Stream closing");
              }
              if (!isClosed && !hasError) {
                isClosed = true;
                controller.close();
              }
              if(handlers.onEnd) {
                handlers.onEnd(id);
              }
            },
            onError: (id: string, error: unknown, errorInfo?: Record<string, unknown>) => {
              handleError(error, errorInfo);
              if(handlers.onError) {
                handlers.onError(id, error, errorInfo);
              }
            }
          },
          verbose,
        })) {
          // The chunks are already handled in the onData handler above
          // No need to process them again here
        }
      } catch (error) {
        handleError(error);
      } finally {
        if (isFlowing) {
          isFlowing = false;
          if (verbose) logger.info("[react-client] Stream closing");
        }
        if (!isClosed && !hasError) {
          isClosed = true;
          controller.close();
        }
      }
    },
  });
}
