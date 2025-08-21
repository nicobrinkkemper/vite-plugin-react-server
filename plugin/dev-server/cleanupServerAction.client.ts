import type { Logger } from "vite";
import { workerData, type Worker } from "node:worker_threads";
import type { MessageHandler } from "../types.js";
import type { ServerResponse } from "node:http";
import type { RscChunkOutputMessage } from "../worker/rsc/types.js";
import type { PassThrough } from "node:stream";
import { getNodeEnv } from "../config/getNodeEnv.js";
import { handleError } from "../error/handleError.js";
import type { CleanupServerActionFn } from "./types.js";


/**
 * Handles cleanup of worker server action resources
 */
export const cleanupServerAction: CleanupServerActionFn =
  function _cleanupServerAction(
    passThrough: PassThrough,
    worker: Worker,
    messageHandler: MessageHandler<RscChunkOutputMessage>,
    res: ServerResponse,
    error?: unknown,
    logger?: Logger
  ) {
    // Remove message handler first to prevent any new messages
    worker.removeListener("message", messageHandler);

    // End the pass-through stream
    passThrough.end();

    // Log error if provided
    if (error) {
      const panicError = handleError({
        error,
        logger,
        mode: getNodeEnv(workerData?.resolvedConfig?.mode),
        panicThreshold: workerData?.userOptions?.panicThreshold,
        critical: false,
        context: "cleanupWorkerServerAction",
      });
      if (panicError != null) {
        throw panicError;
      }
    }

    // End the response
    res.end();
  };
