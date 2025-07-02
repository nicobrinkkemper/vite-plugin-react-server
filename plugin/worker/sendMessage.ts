import { cleanObject } from "../helpers/cleanObject.js";
import type {
  RscWorkerOutputMessage,
} from "./rsc/types.js";
import type { HtmlWorkerOutputMessage } from "./html/types.js";
import { parentPort } from "node:worker_threads";

export function sendMessage(
  msg: HtmlWorkerOutputMessage | RscWorkerOutputMessage,
  port = parentPort
) {
  if (!port) {
    console.error("[Worker] No port available to send message");
    return;
  }

  try {
    // Handle error messages
    if ("error" in msg) {
      const error = msg.error;
      const serializedError =
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
              cause: error.cause,
            }
          : (typeof error === "object" && error !== null && "message" in error && "name" in error)
          ? {
              message: typeof error.message === "string" ? error.message : String(error.message),
              stack: typeof error.stack === "string" ? error.stack : undefined,
              name: typeof error.name === "string" ? error.name : "Error",
              cause: "cause" in error ? error.cause : undefined,
            }
          : {
              message: String(error),
              name: "Error",
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
      // Create a proper error with captured stack trace for better debugging
      const sendError = new Error(
        err instanceof Error ? err.message : String(err)
      );
      sendError.name = err instanceof Error ? err.name : "MessageSendError";
      
      // Capture stack trace excluding this function
      Error.captureStackTrace(sendError, sendMessage);
      
      port.postMessage({
        type: "ERROR",
        error: {
          message: sendError.message,
          name: sendError.name,
          stack: sendError.stack,
        },
      });
    } catch {
      // If we can't even send an error message, just log it
      console.error("[Worker] Critical error - could not send error message");
    }
  }
}
