import type { HandleRscStreamFn } from "./handleRscStream.types.js";
import { createRscStream } from "./createRscStream.server.js";
import { handleError } from "../error/handleError.js";
import { getNodeEnv } from "../config/getNodeEnv.js";

/**
 * 
 */
export const handleRscStream: HandleRscStreamFn<"server"> = function _handleRscStream({
  options,
  logger,
  handlers,
  verbose = false,
  panicThreshold = "none",
}) {
  // Note: worker parameter is ignored in server version
  
  try {
    if (verbose) {
      logger?.info("[handleWorkerRscStream:server] Creating RSC stream directly");
    }

    // Create RSC stream using the helper - message is already CreateRscStreamOptions
    const requestId =
      options.id ??
      `${options.route}-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 11)}`;
    
    const rscResult = createRscStream({
      ...options, 
      id: requestId,
      logger,
      verbose,
      panicThreshold,
      worker: undefined, // No worker in server mode
      loader: (options as any).loader || (() => Promise.resolve({ default: {} })), // Add missing loader
    } as any);

      // Convert the server stream to a ReadableStream
      return new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            if (verbose) {
              logger?.info(
                "[handleWorkerRscStream:server] Starting RSC stream conversion"
              );
            }

            // Set up stream event handlers
            rscResult.rscStream.on("data", (chunk: Buffer) => {
              controller.enqueue(new Uint8Array(chunk));
            });

            rscResult.rscStream.on("end", () => {
              controller.close();

              // Call onEnd handler if provided
              if (handlers.onEnd) {
                handlers.onEnd(options.id ?? options.route);
              }

              if (verbose) {
                logger?.info(
                  "[handleWorkerRscStream:server] RSC stream completed"
                );
              }
            });

            rscResult.rscStream.on("error", (error: unknown) => {
              controller.error(error);
            });

            // Start the RSC stream
            rscResult.pipe(process.stdout);
          } catch (error) {
            const panicError = handleError({
              error,
              logger,
              mode: getNodeEnv(),
              panicThreshold,
              context: "handleWorkerRscStream.server",
            });

            if (panicError != null) {
              controller.error(panicError);
            } else {
              controller.error(
                new Error("RSC stream handling failed", { cause: error })
              );
            }
          }
        },
      });
    } catch (error) {
      const panicError = handleError({
        error,
        logger,
        panicThreshold,
        context: "handleWorkerRscStream.server",
      });

      if (panicError != null) {
        throw panicError;
      }
      throw new Error("RSC stream handling failed", { cause: error });
    }
  };
