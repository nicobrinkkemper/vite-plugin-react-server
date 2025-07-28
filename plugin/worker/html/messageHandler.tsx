import { parentPort, workerData } from "node:worker_threads";
import type {
  HtmlWorkerInputMessage,
  HtmlWorkerRenderState,
  HtmlWorkerOutputMessage,
} from "../html/types.js";
import { createHtmlWorkerRenderState } from "./createHtmlWorkerRenderState.js";
import { serializeError } from "../../error/serializeError.js";
import { createLogger } from "vite";
import { PassThrough } from "node:stream";
import { handleError } from "../../error/handleError.js";

// Track active renders
const activeRenders = new Map<string, HtmlWorkerRenderState>();
// Track which renders have encountered errors to prevent duplicate processing
const errorRenders = new Set<string>();
const logger = createLogger(workerData.resolvedConfig.logLevel ?? "info");

function sendMessage(msg: HtmlWorkerOutputMessage) {
  // Send the original message
  if (typeof msg === "object" && msg != null && "error" in msg) {
    parentPort?.postMessage({
      ...msg,
      error: serializeError(msg.error),
    });
  } else {
    parentPort?.postMessage(msg);
  }
}

async function cleanup(id: string, reason: unknown) {
  const renderState = activeRenders.get(id);
  if (!renderState) {
    // Already cleaned up
    return;
  }

  // CRITICAL: Destroy the RSC stream FIRST to prevent malformed chunks from being sent
  // This prevents React from sending chunks with reason: null through the stream

  renderState.rscStream.destroy();

  // Then abort the React stream
  renderState.stream.abort(reason ?? "cleanup requested");

  renderState.htmlTransform?.destroy();

  // Remove from tracking maps
  activeRenders.delete(id);
  errorRenders.delete(id);

  sendMessage({
    type: "CLEANUP_COMPLETE",
    id,
  });
}
export async function messageHandler(msg: HtmlWorkerInputMessage) {
  const { type, id } = msg;
  try {
    switch (type) {
      case "ROUTE_READY": {
        // Clean up any existing render state for this route
        const existingRenderState = activeRenders.get(id);
        if (existingRenderState) {
          await cleanup(id, "route ready cleanup");
        }

        // Create new render state with fresh streams
        const renderState = createHtmlWorkerRenderState(
          msg,
          sendMessage,
          new PassThrough(),
          logger
        );
        activeRenders.set(id, renderState);
        break;
      }
      case "RSC_CHUNK": {
        // Skip processing if this render has already encountered an error
        if (errorRenders.has(id)) {
          return;
        }

        const renderState = activeRenders.get(id);
        if (!renderState) {
          // Ignore RSC chunks for routes that don't have a render state
          return;
        }

        // Only process RSC chunks for the current route
        // This prevents processing stale chunks from previous routes
        if (renderState.currentRoute !== id) {
          return;
        }

        // Write RSC chunk to the RSC stream
        renderState.rscStream.write(msg.chunk, (error) => {
          if (error != null) {
            sendMessage({
              type: "ERROR",
              id,
              error: error,
            });
          }
        });
        if (workerData.userOptions.verbose) {
          // show first 100 and last 100 characters of the chunk
          const str = Buffer.from(msg.chunk).toString();
          logger.info(
            `[${id}] RSC chunk preview: ${str.slice(
              0,
              200
            )}\n...\n${str.slice(-200)}`
          );
        }
        sendMessage({
          type: "CHUNK_PROCESSED",
          id,
          success: true,
        });
        break;
      }
      case "RSC_END": {
        const renderState = activeRenders.get(id);
        if (!renderState) {
          sendMessage({
            type: "ERROR",
            id,
            error: new Error("No render state found"),
          });
          return;
        }

        // Pipe the rendered content to the HTML stream
        break;
      }
      case "CLEANUP": {
        // Set error state to prevent HTML chunks from being sent
        await cleanup(id, "cleanup requested");
        break;
      }
      case "SHUTDOWN": {
        // If id is "*", clean up all render states
        if (id === "*") {
          const cleanupPromises = [];
          for (const [renderId] of activeRenders) {
            cleanupPromises.push(cleanup(renderId, "shutdown requested"));
          }
          await Promise.all(cleanupPromises);
        } else {
          await cleanup(id, "shutdown requested");
        }
        // Send SHUTDOWN_COMPLETE message to signal that shutdown is complete
        sendMessage({
          type: "SHUTDOWN_COMPLETE",
          id,
        });
        break;
      }
    }
  } catch (error) {
    const panicError = handleError({
      error: error,
      logger: logger,
      panicThreshold: workerData.userOptions.panicThreshold,
      critical: false,
      context: `Message handler error for route ${id}`,
    });
    if (panicError != null) {
      await cleanup("*", panicError);
    }
  }
}
