import { createWorkerStream } from "./createWorkerStream.js";
import type { HandleWorkerRscStreamFn } from "./types.js";
import { getNodeEnv } from "../config/getNodeEnv.js";
import { handleError } from "../error/handleError.js";

/**
 * Handles the RSC stream from the worker.
 * Creates a ReadableStream that pipes RSC chunks to the response.
 *
 * @param worker - The worker thread
 * @param message - The RSC render message
 * @returns A ReadableStream that yields RSC chunks
 */
export const handleWorkerRscStream: HandleWorkerRscStreamFn =
  function _handleWorkerRscStream({
    worker,
    message,
    logger,
    handlers,
    verbose = false,
    rscTimeout,
    panicThreshold = "none",
  }) {
    // Create a ReadableStream from the async generator
    let isFlowing = false;
    let isClosed = false;
    let hasError = false;

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          if (verbose) logger.info("[react-client] Starting stream");

          // Pure generator approach - process chunks directly
          for await (const chunk of createWorkerStream({
            worker,
            message,
            logger,
            handlers: {
              // Only keep non-data handlers for side effects
              onMetrics: handlers.onMetrics,
              onHmrAccept: handlers.onHmrAccept,
              onHmrUpdate: handlers.onHmrUpdate,
              onServerAction: handlers.onServerAction,
              onServerActionResponse: handlers.onServerActionResponse,
              onCssFile: handlers.onCssFile,
              onError: (
                id: string,
                error: unknown,
                errorInfo?: Record<string, unknown>
              ) => {
                if(!hasError) {
                  hasError = true;
                  
                  // Handle error with panic threshold logic
                  const panicError = handleError({
                    error: error,
                    logger: logger,
                    mode: getNodeEnv(),
                    panicThreshold: panicThreshold,
                    critical: false, // React component errors are not critical infrastructure errors
                    context: "handleWorkerRscStream",
                  });
                  
                  // If handleError returns an error due to panicThreshold, close the stream immediately
                  if (panicError != null) {
                    if (!isClosed) {
                      isClosed = true;
                      controller.error(panicError);
                    }
                    return;
                  }
                }
                if (handlers.onError) {
                  handlers.onError(id, error, errorInfo);
                }
              },
            },
            verbose,
            rscTimeout,
            panicThreshold,
          })) {
            // Process chunks directly from generator
            if (!isFlowing) {
              isFlowing = true;
              if (verbose) logger.info("[react-client] Stream is flowing");
            }

            if (!isClosed) {
              controller.enqueue(chunk);
            }

            // Call onData handler if provided
            if (handlers.onData) {
              handlers.onData(message?.id ?? message.route, chunk);
            }
          }

          // Stream ended naturally
          if (isFlowing) {
            isFlowing = false;
            if (verbose) logger.info("[react-client] Stream closing");
          }
          if (!isClosed) {
            isClosed = true;
            controller.close();
          }

          // Call onEnd handler if provided
          if (handlers.onEnd) {
            handlers.onEnd(message?.id ?? message.route);
          }
        } catch (error) {
          if (!hasError) {
            hasError = true;
            const panicError = handleError({
              error: error,
              logger: logger,
              mode: getNodeEnv(),
              panicThreshold: panicThreshold,
              context: "handleWorkerRscStream",
            });
            
            // If handleError returns an error due to panicThreshold, close the stream immediately
            if (panicError != null) {
              if (!isClosed) {
                isClosed = true;
                controller.error(panicError);
              }
              return;
            }
          }
        }
      },
    });
  };
