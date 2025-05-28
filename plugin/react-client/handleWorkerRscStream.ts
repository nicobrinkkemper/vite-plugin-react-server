import type { Logger } from "vite";
import type { RscRenderMessage, StreamHandlers } from "../worker/types.js";
import { createWorkerStream } from "./createWorkerStream.js";
import type { Worker as NodeWorker } from "node:worker_threads";
/**
 * Handles the RSC stream from the worker.
 * Creates a ReadableStream that pipes RSC chunks to the response.
 *
 * @param worker - The worker thread
 * @param message - The RSC render message
 * @returns A ReadableStream that yields RSC chunks
 */
export function handleWorkerRscStream({
  worker,
  message,
  logger,
  handlers,
  verbose = false
}: {
  worker: NodeWorker,
  message: Omit<RscRenderMessage, "type" | "id">,
  logger: Logger,
  handlers: Pick<StreamHandlers, "onMetrics" | "onHmrAccept" | "onHmrUpdate"> &
    Partial<Pick<StreamHandlers, "onError" | "onData" | "onEnd" | "onServerAction" | "onServerActionResponse">>,
  verbose?: boolean
}): ReadableStream<Uint8Array> {
  // Create a ReadableStream from the async generator
  let isFlowing = false;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if(verbose) logger.info("[react-client] Starting stream");
        for await (const chunk of createWorkerStream({
          worker,
          message,
          logger,
          handlers: {
            ...handlers,
            onServerAction: (id: string, args: unknown[]) => {
              if (verbose) logger.info(`[react-client] Received server action ${id}`);
              handlers.onServerAction?.(id, args);
            },
            onServerActionResponse: (id: string, result?: unknown, error?: string) => {
              if (verbose) logger.info(`[react-client] Received server action response ${id}`);
              handlers.onServerActionResponse?.(id, result, error);
            }
          },
          verbose
        })) {
          if (!isFlowing) {
            isFlowing = true;
            if(verbose) logger.info("[react-client] Stream is flowing");
          }
          controller.enqueue(chunk);
        }
      } catch (error) {
        controller.error(error);
      } finally {
        if (isFlowing) {
          isFlowing = false;
          if(verbose) logger.info("[react-client] Stream closing");
        }
        controller.close();
      }
    },
  });
}
