import { parentPort } from "node:worker_threads";
import type { HtmlWorkerInputMessage, HtmlWorkerRenderState, HtmlWorkerOutputMessage } from "../html/types.js";
import { createHtmlWorkerRenderState } from "./createHtmlWorkerRenderState.js";
import { toError } from "../../error/toError.js";
import { serializeError } from "../../error/serializeError.js";

// Track active renders
const activeRenders = new Map<string, HtmlWorkerRenderState>();
// Track which renders have encountered errors to prevent duplicate processing
const errorRenders = new Set<string>();

function sendMessage(msg: HtmlWorkerOutputMessage) {
  // Send the original message
  if ("error" in msg) {
    parentPort?.postMessage({
      ...msg,
      error: serializeError(msg.error),
    });
  } else {
    parentPort?.postMessage(msg);
  }
}

function cleanup(id: string) {
  const renderState = activeRenders.get(id);
  if (!renderState) {
    // Already cleaned up
    return;
  }
  try {
    renderState.stream.abort('cleanup requested');
  } catch (e) {}
  renderState.rscStream.destroy();
  renderState.htmlTransform?.destroy();
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
          // Abort the React stream first to stop it from sending messages
          try {
            existingRenderState.stream.abort('route ready cleanup');
          } catch (e) {
            console.warn('Failed to abort stream', e);
            // Ignore abort errors
          }
          existingRenderState.rscStream.destroy();
          existingRenderState.htmlTransform?.destroy();
          activeRenders.delete(id);
          errorRenders.delete(id);
        }
        
        // Create new render state with fresh streams
        const renderState = createHtmlWorkerRenderState(msg, sendMessage);
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

        // Check if the render state has encountered an error
        if (renderState.hasError) {
          return;
        }

        // Only process RSC chunks for the current route
        // This prevents processing stale chunks from previous routes
        if (renderState.currentRoute !== id) {
          return;
        }

        try {
          // Write RSC chunk to the RSC stream
          renderState.rscStream.write(msg.chunk);
          sendMessage({
            type: "CHUNK_PROCESSED",
            id,
            success: true,
          });
        } catch (error) {
          const err = toError(error);
          errorRenders.add(id);
          sendMessage({
            type: "ERROR",
            id,
            error: err,
          });
          cleanup(id);
        }
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
        const renderState = activeRenders.get(id);
        if (renderState && renderState.setError) {
          renderState.setError();
        }
        cleanup(id);
        break;
      }
      case "SHUTDOWN": {
        // If id is "*", clean up all render states
        if (id === "*") {
          for (const [renderId] of activeRenders) {
            cleanup(renderId);
          }
        } else {
          cleanup(id);
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
    sendMessage({
      type: "ERROR",
      id,
      error: toError(error),
    });
  }
}
