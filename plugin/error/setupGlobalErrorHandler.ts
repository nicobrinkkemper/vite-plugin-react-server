import type {
  CleanupGlobalErrorHandlerFn,
  SetupGlobalErrorHandlerFn,
} from "./types.js";

let isGlobalHandlerSetup = false;
let uncaughtExceptionHandler: ((error: Error) => void) | null = null;
let unhandledRejectionHandler: ((reason: unknown, promise: Promise<unknown>) => void) | null = null;

export const setupGlobalErrorHandler: SetupGlobalErrorHandlerFn =
  function _setupGlobalErrorHandler(options) {
    const { panicThreshold, logger, verbose = false } = options;

    if (isGlobalHandlerSetup) {
      return;
    }

    if (verbose) {
      logger.info(
        `Setting up global error handler for panic threshold: ${panicThreshold}`
      );
    }

    uncaughtExceptionHandler = (error: Error) => {
      if (verbose) {
        logger.info(
          `Global error handler caught uncaught exception: ${error.message}`
        );
      }

      logger.warn(
        `Uncaught exception handled by panic threshold (${panicThreshold}): ${error.message}`
      );
    };

    unhandledRejectionHandler = (reason: unknown, _promise: Promise<unknown>) => {
      if (verbose) {
        logger.info(
          `Global error handler caught unhandled rejection: ${reason}`
        );
      }

      logger.warn(
        `Unhandled rejection handled by panic threshold (${panicThreshold}): ${reason}`
      );
    };

    process.on("uncaughtException", uncaughtExceptionHandler);
    process.on("unhandledRejection", unhandledRejectionHandler);

    isGlobalHandlerSetup = true;
  };

export const cleanupGlobalErrorHandler: CleanupGlobalErrorHandlerFn =
  function _cleanupGlobalErrorHandler() {
    if (!isGlobalHandlerSetup) {
      return;
    }

    if (uncaughtExceptionHandler) {
      process.removeListener("uncaughtException", uncaughtExceptionHandler);
      uncaughtExceptionHandler = null;
    }
    if (unhandledRejectionHandler) {
      process.removeListener("unhandledRejection", unhandledRejectionHandler);
      unhandledRejectionHandler = null;
    }

    isGlobalHandlerSetup = false;
  };
