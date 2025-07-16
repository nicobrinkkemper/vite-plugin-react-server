import { createLogger, type Logger } from "vite";
import { toError } from "./toError.js";
import { getNodeEnv } from "../getNodeEnv.js";

/**
 * If the error is repeated, we will not log it again
 */
let prevError: string = "";
let prevErrorRepeat: number = 0;

export function logError(
  error: unknown,
  logger: Logger | Console = createLogger(),
  mode: "development" | "production" | "test" = getNodeEnv(),
) {
  const err = toError(error);
  let errorOptions = {
    error: err,
    clear: mode === "development",
    timestamp: mode !== "test",
  };
  if (mode === "development") {
    errorOptions.clear = true;
    // Simplified error deduplication without stack trace generation to avoid recursion
    const errorKey = err.message + (err.stack || "");
    if (prevError === errorKey) {
      prevErrorRepeat++;
      if(prevErrorRepeat > 100) {
        console.trace('Max error repeat reached', err);
        process.exit(1);
      }
      logger.error(`(x${prevErrorRepeat}) Repeated error`, {
        error: err,
        clear: false,
        timestamp: true,
      });
      return;
    }
    prevError = errorKey;
    prevErrorRepeat = 1;
  }
  if (mode !== "production") {
    if (
      err.stack &&
      err.message.length > 0 &&
      err.stack.includes(err.message)
    ) {
      logger.error(err.stack, errorOptions);
    } else if (err.stack && err.stack.length > 0 && err.message.length > 0) {
      logger.error(err.message + "\n" + err.stack, errorOptions);
    } else if (err.stack && err.stack.length > 0) {
      logger.error(err.stack, errorOptions);
    } else if (err.message.length > 0) {
      logger.error(err.message, errorOptions);
    } else {
      logger.error("Unknown error", errorOptions);
    }
  } else if (typeof err.message === "string") {
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
