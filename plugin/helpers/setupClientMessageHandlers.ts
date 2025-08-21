import type { RscWorkerOutputMessage } from "../worker/rsc/types.js";
import { getStashedRscStream, clearStashedRscStream } from "../config/stashedOptionsState.js";
import type { Logger } from "vite";
import { toError } from "../error/toError.js";

export type SetupClientMessageHandlersOptions = {
  worker: any; // Worker thread
  logger?: Logger;
  verbose?: boolean;
};

export type SetupClientMessageHandlersFn = (
  options: SetupClientMessageHandlersOptions
) => () => void; // Returns cleanup function

/**
 * Sets up message handlers for the client environment to receive RSC chunks from the worker.
 * This reconstructs the RSC stream from worker messages.
 */
export const setupClientMessageHandlers: SetupClientMessageHandlersFn = function _setupClientMessageHandlers({
  worker,
  logger,
  verbose = false,
}) {
  const messageHandler = (message: RscWorkerOutputMessage) => {
    if (!message) {
      logger?.warn("Received undefined message");
      return;
    }

    switch (message.type) {
      case "RSC_CHUNK": {
        const rscStream = getStashedRscStream(message.id);
        if (!rscStream) {
          logger?.warn(`No RSC stream found for id: ${message.id}`);
          return;
        }

        try {
          // Write RSC chunk to the stream
          rscStream.write(message.chunk);
          if (verbose) {
            logger?.info(`[client] Wrote RSC chunk: ${message.chunk.length} bytes for ${message.id}`);
          }
        } catch (error: any) {
          logger?.error(`Error writing RSC chunk: ${error.message}`);
          clearStashedRscStream(message.id);
        }
        break;
      }

      case "RSC_END": {
        const rscStream = getStashedRscStream(message.id);
        if (!rscStream) {
          logger?.warn(`No RSC stream found for id: ${message.id}`);
          return;
        }

        try {
          // End the RSC stream
          rscStream.end();
          if (verbose) {
            logger?.info(`[client] Ended RSC stream for ${message.id}`);
          }
        } catch (error: any) {
          logger?.error(`Error ending RSC stream: ${error.message}`);
        } finally {
          // Clean up the stream reference
          clearStashedRscStream(message.id);
        }
        break;
      }

      case "ERROR": {
        const rscStream = getStashedRscStream(message.id);
        if (rscStream) {
          // Emit error on the stream
          const errorMessage = typeof message.error === 'object' && message.error !== null && 'message' in message.error 
            ? String(message.error.message) 
            : 'Unknown error';
          rscStream.emit("error", new Error(errorMessage));
          clearStashedRscStream(message.id);
        }
        const errorMessage = typeof message.error === 'object' && message.error !== null && 'message' in message.error 
          ? String(message.error.message) 
          : 'Unknown error';
        logger?.error(`Worker error for ${message.id}: ${errorMessage}`, {error: toError(message.error)});
        break;
      }

      case "READY":
        if (verbose) {
          logger?.info("[client] Worker is ready");
        }
        break;

      case "RSC_METRICS":
        if (verbose) {
          logger?.info(`[client] RSC metrics for ${message.id}: ${JSON.stringify(message.metrics)}`);
        }
        break;

      case "HMR_UPDATE":
        if (verbose) {
          logger?.info(`[client] HMR update for ${message.id}: ${message.routes?.join(', ')}`);
        }
        break;

      case "HMR_ACCEPT":
        if (verbose) {
          logger?.info(`[client] HMR accept for ${message.id}: ${message.routes?.join(', ')}`);
        }
        break;

      case "CSS_FILE":
        if (verbose) {
          logger?.info(`[client] CSS file received: ${message.id}`);
        }
        break;

      case "SERVER_MODULE":
        if (verbose) {
          logger?.info(`[client] Server module received: ${message.id}`);
        }
        break;

      default:
        logger?.warn(`Unknown worker message type: ${(message as { type: string }).type}`);
    }
  };

  // Set up the message handler
  worker.on("message", messageHandler);

  // Return cleanup function
  return () => {
    worker.off("message", messageHandler);
  };
}; 