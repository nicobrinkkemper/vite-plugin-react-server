import { parentPort } from "node:worker_threads";
import type { HtmlWorkerInputMessage, HtmlWorkerRenderState, HtmlWorkerOutputMessage } from "../html/types.js";
import { createHtmlWorkerRenderState } from "./createHtmlWorkerRenderState.js";
import { toError } from "../../error/toError.js";

// Track active renders
const activeRenders = new Map<string, HtmlWorkerRenderState>();

function sendMessage(msg: HtmlWorkerOutputMessage) {
  // Send the original message
  if ("error" in msg && msg.error instanceof Error) {
    parentPort?.postMessage({
      ...msg,
      error: {
        message: msg.error.message,
        stack: msg.error.stack,
        name: msg.error.name,
        cause: msg.error.cause,
      },
    });
  } else {
    parentPort?.postMessage(msg);
  }
}

function cleanup(id: string) {
  const renderState = activeRenders.get(id);
  if (renderState) {
    renderState.rscStream.destroy();
    renderState.htmlTransform?.destroy();
    activeRenders.delete(id);

    sendMessage({
      type: "CLEANUP_COMPLETE",
      id,
    });
  }
}
export async function messageHandler(msg: HtmlWorkerInputMessage) {
  const { type, id } = msg;
  try {
    switch (type) {
      case "ROUTE_READY": {
        let renderState = activeRenders.get(id);
        if (!renderState) {
          renderState = createHtmlWorkerRenderState(msg, sendMessage);
          
          activeRenders.set(id, renderState);
        } else {
          throw new Error("Render state already exists");
        }
        break;
      }
      case "RSC_CHUNK": {
        let renderState = activeRenders.get(id);
        if (!renderState) {
          throw new Error(`No render state found for id: ${id}`);
        }

        try {
          // Write RSC chunk to the RSC stream
          renderState.rscStream.write(msg.chunk);
          sendMessage({
            type: "CHUNK_PROCESSED",
            id,
            success: true,
          });
        } catch (error: any) {
          sendMessage({
            type: "ERROR",
            id,
            error: `Error writing chunk: ${error.message}`,
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
            error: "No render state found",
          });
          return;
        }

        // Pipe the rendered content to the HTML stream
        break;
      }
      case "CLEANUP": {
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
