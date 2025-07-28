import { createLogger, type Logger } from "vite";
import { getNodeEnv } from "../config/getNodeEnv.js";
import { isMainThread } from "node:worker_threads";
/**
 * Simple error logging function focused purely on logging errors
 * without any deduplication or complex formatting logic
 */
export function logError(
  err: Error,
  logger: Logger | Console = createLogger(),
  mode: "development" | "production" | "test" = getNodeEnv()
) {
  if (!isMainThread || (logger == null || typeof logger.error !== "function")) {
    return;
  }
  const errorOptions = {
    error: err,
    clear: mode === "development",
    timestamp: mode !== "test",
  };

  // Simple error logging based on mode
  if (mode !== "production") {
    if (
      err.stack &&
      (err.message?.length ?? 0) > 0 &&
      err.stack.includes(err.message)
    ) {
      logger.error(err.stack, errorOptions);
    } else if ((err.stack?.length ?? 0) > 0 && (err.message?.length ?? 0) > 0) {
      logger.error(err.message + "\n" + err.stack, errorOptions);
    } else if ((err.stack?.length ?? 0) > 0 && typeof err.stack === "string") {
      logger.error(err.stack, errorOptions);
    } else if ((err.message?.length ?? 0) > 0) {
      logger.error(err.message, errorOptions);
    } else {
      logger.error("Unknown error", errorOptions);
    }
  } else {
    // Production mode - simplified logging
    if (typeof err.message === "string") {
      logger.error(err.message, errorOptions);
    } else if (
      typeof err.message === "object" &&
      err.message !== null &&
      "message" in err.message
    ) {
      logger.error(err.message, errorOptions);
    } else if (err.stack) {
      logger.error(err.stack, errorOptions);
    } else if (
      err != null &&
      typeof err === "object" &&
      "reason" in err &&
      typeof err.reason === "string"
    ) {
      logger.error(err.reason, errorOptions);
    } else if (
      err != null &&
      typeof err === "object" &&
      "error" in err &&
      typeof err.error === "string"
    ) {
      logger.error(err.error, errorOptions);
    } else {
      logger.error(JSON.stringify(err), errorOptions);
    }
  }
}
