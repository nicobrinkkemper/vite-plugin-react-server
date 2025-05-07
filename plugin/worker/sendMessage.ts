import { cleanObject } from "../helpers/cleanObject.js";
import type { HtmlWorkerOutputMessage, RscWorkerOutputMessage } from "./types.js";
import { parentPort } from "node:worker_threads";

export function sendMessage(msg: HtmlWorkerOutputMessage | RscWorkerOutputMessage, port = parentPort) {
  if (!port) {
    console.error("[Worker] No port available to send message");
    return;
  }

  try {
    // Handle error messages
    if ('error' in msg) {
      const error = msg.error;
      const serializedError = error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
        cause: error.cause,
      } : {
        message: String(error),
        name: 'Error',
      };

      port.postMessage({
        ...cleanObject(msg),
        error: serializedError,
      });
    } else {
      // Handle non-error messages
      port.postMessage(cleanObject(msg));
    }
  } catch (err) {
    console.error("[Worker] Failed to send message:", err);
    // Try to send a basic error message
    try {
      port.postMessage({
        type: "ERROR",
        error: {
          message: err instanceof Error ? err.message : String(err),
          name: err instanceof Error ? err.name : 'Error',
        },
      });
    } catch {
      // If we can't even send an error message, just log it
      console.error("[Worker] Critical error - could not send error message");
    }
  }
}