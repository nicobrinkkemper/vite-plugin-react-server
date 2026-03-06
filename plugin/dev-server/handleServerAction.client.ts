import type {
  RscChunkOutputMessage,
  RscWorkerInputMessage,
  RscWorkerOutputMessage,
} from "../worker/rsc/types.js";
import {
  parseServerActionRequestBody,
  setupServerActionHeaders,
  createServerActionStream,
  handleServerActionError,
} from "../helpers/handleServerAction.client.js";
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
      // Get action ID from x-rsc-action header (React's standard) or fall back to body/URL
      const headerActionId = req.headers["x-rsc-action"] as string | undefined;
      const parsed = parseServerActionRequestBody(body, req.url);
      const id = headerActionId || parsed.id;
      const args = parsed.args;

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
      messageHandler = (message: RscWorkerOutputMessage & { error?: { message: string } }) => {
        try {
          if (message.type === "RSC_CHUNK") {
            passThrough.write(message.chunk);
          } else if (message.type === "RSC_END") {
            if (messageHandler) {
              cleanupServerAction(passThrough, worker, messageHandler, res);
            }
          } else if (message.type === "SERVER_ACTION_RESPONSE") {
            // Server action completed - write result in RSC format and end stream
            // RSC format: 0:<json-value>\n
            if (message.error?.message) {
              logger.error(`[handleServerAction] Server action error: ${message.error?.message}`);
              passThrough.write(`0:${JSON.stringify({ error: message.error.message })}\n`);
            } else if(typeof message.error === "string") {
              logger.error(`[handleServerAction] Server action error: ${message.error}`);
              passThrough.write(`0:${JSON.stringify({ error: message.error })}\n`);
            } else {
              // Write the result directly - React will unwrap it
              passThrough.write(`0:${JSON.stringify(message.result)}\n`);
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
