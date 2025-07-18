import type { Logger } from "vite";
import type { Worker } from "node:worker_threads";
import { logError } from "../error/logError.js";
import type { MessageHandler } from "../types.js";
import type { ServerResponse } from "node:http";
import type { RscChunkOutputMessage } from "../worker/rsc/types.js";
import type { PassThrough } from "node:stream";
import type { CleanupWorkerServerActionFn } from "./types.js";

/**
 * Handles cleanup of worker server action resources
 */
export const cleanupWorkerServerAction: CleanupWorkerServerActionFn =
  function _cleanupWorkerServerAction(
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
    if (error && logger) {
      logError(error, logger);
    }

    // End the response
    res.end();
  };
