import { cleanObject } from "../helpers/cleanObject.js";
import { parentPort } from "node:worker_threads";
import type { SendMessageFn } from "./types.js";

export const sendMessage: SendMessageFn = function _sendMessage(
  msg,
  port = parentPort
) {
  if (!port) {
    throw new Error("No port available to send message");
  }

  try {
    // Handle error messages
    if ("error" in msg) {
      const error = msg.error;
      const hasErrorInfo =
        "errorInfo" in msg &&
        msg.errorInfo != null &&
        typeof msg.errorInfo === "object";
      const serializedError =
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
              cause: error.cause,
            }
          : typeof error === "object" &&
            error !== null &&
            "message" in error &&
            "name" in error
          ? {
              message:
                typeof error.message === "string"
                  ? error.message
                  : String(error.message),
              stack: typeof error.stack === "string" ? error.stack : undefined,
              name: typeof error.name === "string" ? error.name : "Error",
              cause: "cause" in error ? error.cause : undefined,
            }
          : {
              message: String(error),
              name: "Error",
            };

      const errorInfo = hasErrorInfo
        ? {
            componentStack: msg.errorInfo?.componentStack,
            digest: msg.errorInfo?.digest,
          }
        : undefined;
      port.postMessage({
        ...cleanObject(msg),
        error: serializedError,
        errorInfo,
      });
    } else {
      // Handle non-error messages
      port.postMessage(cleanObject(msg));
    }
  } catch (err) {
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
  }
};
