import type {
  CleanupGlobalErrorHandlerFn,
  SetupGlobalErrorHandlerFn,
} from "./types.js";

let isGlobalHandlerSetup = false;

export const setupGlobalErrorHandler: SetupGlobalErrorHandlerFn =
  function _setupGlobalErrorHandler(options) {
    const { panicThreshold, logger, verbose = false } = options;

    // Only set up global error handling for all_errors panic threshold
    if (panicThreshold !== "all_errors" || isGlobalHandlerSetup) {
      return;
    }

    if (verbose) {
      logger.info(
        "[react-client] Setting up global error handler for all_errors panic threshold"
      );
    }

    // Set up our error handlers
    process.on("uncaughtException", (error: Error) => {
      if (verbose) {
        logger.info(
          `[react-client] Global error handler caught uncaught exception: ${error.message}`
        );
      }

      // For all_errors panic threshold, we want to handle the error gracefully
      // and prevent it from crashing the process
      logger.warn(
        `[react-client] Uncaught exception handled by all_errors panic threshold: ${error.message}`
      );

      // Don't call process.exit - let the error be handled gracefully
    });

    process.on(
      "unhandledRejection",
      (reason: unknown, _promise: Promise<unknown>) => {
        if (verbose) {
          logger.info(
            `[react-client] Global error handler caught unhandled rejection: ${reason}`
          );
        }

        // For all_errors panic threshold, we want to handle the rejection gracefully
        logger.warn(
          `[react-client] Unhandled rejection handled by all_errors panic threshold: ${reason}`
        );

        // Don't call process.exit - let the rejection be handled gracefully
      }
    );

    isGlobalHandlerSetup = true;
  };

export const cleanupGlobalErrorHandler: CleanupGlobalErrorHandlerFn =
  function _cleanupGlobalErrorHandler() {
    if (!isGlobalHandlerSetup) {
      return;
    }

    // Remove our handlers
    process.removeAllListeners("uncaughtException");
    process.removeAllListeners("unhandledRejection");

    isGlobalHandlerSetup = false;
  };
