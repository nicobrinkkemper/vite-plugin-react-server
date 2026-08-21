import type {
  RscChunkOutputMessage,
  RscWorkerInputMessage,
  RscWorkerOutputMessage,
} from "../worker/rsc/types.js";
import {
  setupServerActionHeaders,
  createServerActionStream,
  handleServerActionError,
  writeServerActionOutcome,
} from "../helpers/handleServerAction.client.js";
import { readServerActionForWorker } from "../helpers/handleServerActionHelper.js";
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
      // Read the request into worker-message parts: raw text / multipart
      // bytes for the worker's transport decodeReply, or legacy envelope args.
      // The x-rsc-action header (React's standard) wins for the id.
      const parts = await readServerActionForWorker(req);

      // Set up response headers
      setupServerActionHeaders(res);

      // Send server action request to worker
      worker.postMessage({
        type: "SERVER_ACTION",
        ...parts,
      } satisfies RscWorkerInputMessage);

      // Create a pass-through stream for the response

      // Handle worker messages with proper error handling
      messageHandler = (message: RscWorkerOutputMessage & { error?: { message: string } }) => {
        try {
          if (message.type === "RSC_CHUNK") {
            passThrough.write(message.chunk);
          } else if (message.type === "RSC_END") {
            if (messageHandler) {
              cleanupServerAction(passThrough, worker, messageHandler, res);
            }
          } else if (message.type === "SERVER_ACTION_RESPONSE") {
            // Server action completed — the worker rendered the payload
            // through the transport's flight renderer; the shared writer maps
            // terminal outcomes (redirect/not-found/error) identically to the
            // react-server handler.
            writeServerActionOutcome(
              message as {
                error?: string | Record<string, unknown>;
                flight?: string;
                result?: unknown;
              },
              passThrough,
              res,
              logger
            );
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
