import { toError } from "./toError.js";
import { getNodeEnv } from "../config/getNodeEnv.js";
import { logError } from "./logError.js";
import { PANIC_SYMBOL } from "./shouldPanic.js";
import type { HandleErrorFn } from "./types.js";

let errRepeat = 0;
let lastError: Error | null = null;
/**
 * Simplified error handling function that:
 * - Formats and logs errors
 * - Handles panic thresholds
 * - Returns error to throw or null to continue
 */
export const handleError: HandleErrorFn = function _handleError(
  options
): Error | null {
  const {
    error,
    errorInfo,
    // Default to `console` (not vite's createLogger) so this is edge-bundle safe.
    logger = console,
    mode = getNodeEnv(),
    panicThreshold = "none",
    critical = false,
    log = false,
  } = options;
  // Handle React error info if present
  if (errorInfo != null) {
    const errInfo = new Error(`Digest: ${(errorInfo as any).digest ?? 'unknown'}`);
    errInfo.stack = errorInfo.componentStack ?? undefined;
    errInfo.name = "ErrorInfo";
    if (log) logError(errInfo, logger, mode);
  }

  const err = toError(error, errorInfo ?? undefined);

  // Simple panic threshold logic
  if (panicThreshold === "all_errors" || (critical && panicThreshold === "critical_errors")) {
    // Mark error for panic and return it to be thrown
    (err as any)[PANIC_SYMBOL] = true;
    return err;
  }

  if (log) {
    if (
      lastError?.message === (error as Error)?.message &&
      lastError?.stack === (error as Error)?.stack
    ) {
      errRepeat++;
      const repeatedFrom = new Error("Error repeated", { cause: err });
      repeatedFrom.stack = err.stack;
      logger.error(`${err.message} (${errRepeat})`, { error: repeatedFrom });
    } else {
      errRepeat = 0;
      lastError = error as Error;
      logError(err, logger, mode);
    }
  }

  // For "none" or non-critical errors, continue processing
  return null;
};
