import type {
  CleanupGlobalErrorHandlerFn,
  SetupGlobalErrorHandlerFn,
} from "./types.js";

let isGlobalHandlerSetup = false;

export const setupGlobalErrorHandler: SetupGlobalErrorHandlerFn =
  function _setupGlobalErrorHandler(options) {
    const { panicThreshold, logger, verbose = false } = options;

    // Set up global error handling for all panic threshold levels
    if (isGlobalHandlerSetup) {
      return;
    }

    if (verbose) {
      logger.info(
        `Setting up global error handler for panic threshold: ${panicThreshold}`
      );
    }

    // Set up our error handlers
    process.on("uncaughtException", (error: Error) => {
      if (verbose) {
        logger.info(
          `Global error handler caught uncaught exception: ${error.message}`
        );
      }

      // Handle the error gracefully based on panic threshold
      logger.warn(
        `Uncaught exception handled by panic threshold (${panicThreshold}): ${error.message}`
      );

      // Don't call process.exit - let the error be handled gracefully
    });

    process.on(
      "unhandledRejection",
      (reason: unknown, _promise: Promise<unknown>) => {
        if (verbose) {
          logger.info(
            `Global error handler caught unhandled rejection: ${reason}`
          );
        }

        // Handle the rejection gracefully based on panic threshold
        logger.warn(
          `Unhandled rejection handled by panic threshold (${panicThreshold}): ${reason}`
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
