import type { Logger } from "vite";
import type { RscRenderMessage, StreamHandlers } from "../worker/types.js";
import { createWorkerStream } from "./createWorkerStream.js";
import { toError } from "../error/toError.js";
import type { Worker as NodeWorker } from "node:worker_threads";
/**
 * Handles the RSC stream from the worker.
 * Creates a ReadableStream that pipes RSC chunks to the response.
 *
 * @param worker - The worker thread
 * @param message - The RSC render message
 * @returns A ReadableStream that yields RSC chunks
 */
export function handleWorkerRscStream(
  worker: NodeWorker,
  message: Omit<RscRenderMessage, "type" | "id">,
  logger: Logger,
  handlers: Pick<StreamHandlers, "onMetrics" | "onHmrAccept" | "onHmrUpdate"> &
    Partial<Pick<StreamHandlers, "onError" | "onData" | "onEnd">>
): ReadableStream<Uint8Array> {
  // Create a ReadableStream from the async generator
  let isFlowing = false;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        logger.info("Starting stream");
        for await (const chunk of createWorkerStream({
          worker,
          message,
          logger,
          handlers,
        })) {
          if (!isFlowing) {
            isFlowing = true;
            logger.info("Stream is flowing");
          }
          controller.enqueue(chunk);
        }
      } catch (error) {
        const err = toError(error);
        logger.error(err.message, {
          error: err,
        });
        controller.error(err);
      } finally {
        if (isFlowing) {
          isFlowing = false;
          logger.info("Stream closing");
        }
        controller.close();
      }
    },
  });
}
