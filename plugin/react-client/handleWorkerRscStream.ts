import type { Logger } from "vite";
import type { RscRenderMessage } from "../worker/rsc/types.js";
import type { StreamHandlers } from "../worker/types.js";
import { createWorkerStream } from "./createWorkerStream.js";
import type { Worker as NodeWorker } from "node:worker_threads";
import type { InlineCssOpt, PagePropOpt } from "../types.js";
/**
 * Handles the RSC stream from the worker.
 * Creates a ReadableStream that pipes RSC chunks to the response.
 *
 * @param worker - The worker thread
 * @param message - The RSC render message
 * @returns A ReadableStream that yields RSC chunks
 */
export function handleWorkerRscStream<
  T extends PagePropOpt = PagePropOpt,
  InlineCSS extends InlineCssOpt = InlineCssOpt,
  N1 extends string = "Page",
  N2 extends string = "props"
>({
  worker,
  message,
  logger,
  handlers,
  verbose = false,
}: {
  worker: NodeWorker;
  message: Omit<RscRenderMessage<T, InlineCSS, N1, N2>, "type" | "id"> &
    Partial<Pick<RscRenderMessage<T, InlineCSS, N1, N2>, "id">> & {
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
}): ReadableStream<Uint8Array> {
  // Create a ReadableStream from the async generator
  let isFlowing = false;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
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
              controller.enqueue(chunk);
              if(handlers.onData) {
                handlers.onData(id, chunk);
              }
            },
            onEnd: (id: string) => {
              if (isFlowing) {
                isFlowing = false;
                if (verbose) logger.info("[react-client] Stream closing");
              }
              controller.close();
              if(handlers.onEnd) {
                handlers.onEnd(id);
              }
            },
            onError: (id: string, error: unknown, errorInfo?: Record<string, unknown>) => {
              controller.error(error instanceof Error ? error : new Error(String(error)));
              if(handlers.onError) {
                handlers.onError(id, error, errorInfo);
              }
            }
          },
          verbose,
        })) {
          if (!isFlowing) {
            isFlowing = true;
            if (verbose) logger.info("[react-client] Stream is flowing");
          }
          controller.enqueue(chunk);
        }
      } catch (error) {
        controller.error(error);
      } finally {
        if (isFlowing) {
          isFlowing = false;
          if (verbose) logger.info("[react-client] Stream closing");
        }
        controller.close();
      }
    },
  });
}
