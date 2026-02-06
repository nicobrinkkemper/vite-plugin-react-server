import type {
  RscChunkOutputMessage,
  RscWorkerInputMessage,
  RscWorkerOutputMessage,
} from "../worker/rsc/types.js";
import {
  parseServerActionRequest,
  setupServerActionHeaders,
  createServerActionStream,
  handleServerActionError,
} from "../helpers/handleServerAction.js";
import type { MessageHandler } from "../types.js";
import { cleanupServerAction } from "./cleanupServerAction.client.js";
import type { HandleWorkerServerActionFn } from "../react-client/types.js";

/**
 * Handles server action requests in the worker scenario.
 *
 * @param req - The incoming request
 * @param res - The response object
 * @param worker - The worker thread
 * @param logger - The Vite logger
 */
export const handleServerAction: HandleWorkerServerActionFn =
  async function _handleWorkerServerAction(req, res, worker, logger) {
    let messageHandler: MessageHandler<RscChunkOutputMessage> | null = null;

    const passThrough = createServerActionStream(res);
    try {
      // Read request body
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString();

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

      // Handle worker messages with proper error handling
      messageHandler = (message: RscWorkerOutputMessage) => {
        try {
          if (message.type === "RSC_CHUNK") {
            passThrough.write(message.chunk);
          } else if (message.type === "RSC_END") {
            if (messageHandler) {
              cleanupServerAction(passThrough, worker, messageHandler, res);
            }
          } else if (message.type === "SERVER_ACTION_RESPONSE") {
            // Server action completed - write result and end stream
            if (message.error) {
              logger.error(`[handleServerAction] Server action error: ${message.error}`);
              passThrough.write(JSON.stringify({ error: message.error }));
            } else {
              passThrough.write(JSON.stringify({ returnValue: message.result }));
            }
            if (messageHandler) {
              cleanupServerAction(passThrough, worker, messageHandler, res);
            }
          } else if (message.type === "ERROR") {
            if (messageHandler) {
              cleanupServerAction(
                passThrough,
                worker,
                messageHandler,
                res,
                message.error,
                logger
              );
            }
          }
        } catch (error) {
          logger.error(`[handleServerAction] Message handler error: ${error}`);
          if (messageHandler) {
            cleanupServerAction(
              passThrough,
              worker,
              messageHandler,
              res,
              error,
              logger
            );
          }
        }
      };

      worker.on("message", messageHandler);

      // Handle errors
      passThrough.on("error", (error: unknown) => {
        if (messageHandler) {
          cleanupServerAction(
            passThrough,
            worker,
            messageHandler,
            res,
            error,
            logger
          );
        }
      });
    } catch (error) {
      handleServerActionError(error, res, logger);
    }
  };
