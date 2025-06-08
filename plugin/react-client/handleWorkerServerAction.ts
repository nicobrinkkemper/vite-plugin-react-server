import type { ViteDevServer } from "vite";
import type { Worker } from "node:worker_threads";
import type { RscChunkOutputMessage, RscWorkerInputMessage, RscWorkerOutputMessage } from "../worker/rsc/types.js";
import {
  parseServerActionRequest,
  setupServerActionHeaders,
  createServerActionStream,
  handleServerActionError
} from "../helpers/handleServerAction.js";
import type { MessageHandler } from "../types.js";
import { cleanupWorkerServerAction } from "./cleanupWorkerServerAction.js";
import type { IncomingMessage, ServerResponse } from "node:http";


/**
 * Handles server action requests in the worker scenario.
 * 
 * @param req - The incoming request
 * @param res - The response object
 * @param worker - The worker thread
 * @param logger - The Vite logger
 */
export async function handleWorkerServerAction(
  req: IncomingMessage,
  res: ServerResponse,
  worker: Worker,
  logger: ViteDevServer["config"]["logger"]
) {
  let messageHandler: MessageHandler<RscChunkOutputMessage> | null = null;

  const passThrough = createServerActionStream(res);
  try {
    // Read request body
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString();

    try {
      // Parse the server action request
      const { id, args } = parseServerActionRequest(body, req.url);

      // Set up response headers
      setupServerActionHeaders(res);

      // Send server action request to worker
      worker.postMessage({
        type: "SERVER_ACTION",
        id,
        args,
      } satisfies RscWorkerInputMessage);

      // Create a pass-through stream for the response

      // Handle worker messages
      messageHandler = (message: RscWorkerOutputMessage) => {
        if (message.type === "RSC_CHUNK") {
          passThrough.write(message.chunk);
        } else if (message.type === "RSC_END") {
          if (messageHandler) {
            cleanupWorkerServerAction(passThrough, worker, messageHandler, res);
          }
        } else if (message.type === "ERROR") {
          if (messageHandler) {
            cleanupWorkerServerAction(passThrough, worker, messageHandler, res, message.error, logger);
          }
        }
      };

      worker.on("message", messageHandler);

      // Handle errors
      passThrough.on("error", (error: unknown) => {
        if (messageHandler) {
          cleanupWorkerServerAction(passThrough, worker, messageHandler, res, error, logger);
        }
      });
    } catch (parseError) {
      // Handle parsing errors
      if (passThrough && messageHandler) {
        cleanupWorkerServerAction(passThrough, worker, messageHandler, res, parseError, logger);
      } else {
        handleServerActionError(parseError, res, logger);
      }
    }
  } catch (error: unknown) {
    // If we have a pass-through stream, clean it up
    if (passThrough && messageHandler) {
      cleanupWorkerServerAction(passThrough, worker, messageHandler, res, error, logger);
    } else {
      // If we haven't set up the stream yet, use the standard error handler
      handleServerActionError(error, res, logger);
    }
  }
} 