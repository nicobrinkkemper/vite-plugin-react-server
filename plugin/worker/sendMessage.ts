import { cleanObject } from "../helpers/cleanObject.js";
import { parentPort } from "node:worker_threads";
import type { SendMessageFn } from "./types.js";
import { serializeError } from "../error/serializeError.js";
import { serializeErrorInfo } from "../error/serializeErrorInfo.js";

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
      const serializedError = serializeError(error);

      const errorInfo = hasErrorInfo
        ? serializeErrorInfo(msg.errorInfo)
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
