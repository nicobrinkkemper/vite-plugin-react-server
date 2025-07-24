import { createLogger } from "vite";
import { toError } from "./toError.js";
import { getNodeEnv } from "../getNodeEnv.js";
import { logError } from "./logError.js";
import { PANIC_SYMBOL } from "./shouldPanic.js";
import type { HandleErrorFn } from "./types.js";

/**
 * Error deduplication state
 */
let prevError: string = "";
let prevErrorRepeat: number = 0;

/**
 * Comprehensive error handling function that composes:
 * - Error deduplication
 * - Error formatting
 * - Error logging
 * - Process termination for repeated errors
 * - Panic threshold handling
 */
export const handleError: HandleErrorFn = function _handleError(
  options
): Error | null {
  const {
    error,
    errorInfo,
    logger = createLogger(),
    mode = getNodeEnv(),
    panicThreshold = "none",
    critical = false,
    context = "unknown", // Add context parameter
  } = options;

  if (errorInfo != null && errorInfo.componentStack != null) {
    // always log errorInfo and then ignore it for the rest of the function
    logError(errorInfo.componentStack, logger, mode);
  }
  const err = toError(error, errorInfo);


  // Handle error logging, when you dont need logging dont pass logger
  const errorKey = err.message;
  if (prevError === errorKey) {
    prevErrorRepeat++;
    if (prevErrorRepeat > 100) {
      // Always throw an error instead of exiting the process
      throw new Error("Max error repeat reached in " + context);
    }
    return null;
  } else {
    prevErrorRepeat = 0;
  }
  prevError = errorKey;
  prevErrorRepeat = 0;

  if(prevErrorRepeat === 0) {
    logError(err, logger, mode);
  } else if(logger != null && typeof logger.error === "function") {
    logger.error(`(x${prevErrorRepeat}) ${context} ${String(err.stack)}`, { 
      error: err,
      clear: false,
      timestamp: true,
    });
  }

  // For panic thresholds, check if this error has already been processed
  if (panicThreshold === "all_errors") {
    // Add PANIC_SYMBOL to the error so assertPanic will throw it
    (err as any)[PANIC_SYMBOL] = true;
    // Return the original error to preserve stack trace
    return err;
  }

  if (critical && panicThreshold === "critical_errors") {
    // Add PANIC_SYMBOL to the error so assertPanic will throw it
    (err as any)[PANIC_SYMBOL] = true;
    return err;
  }
  // Delegate to logError for actual error logging
  return null;
};
