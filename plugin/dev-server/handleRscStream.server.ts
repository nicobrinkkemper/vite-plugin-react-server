import type { HandleWorkerRscStreamFn } from "./types.js";
import { createRscStream } from "./createRscStream.server.js";
import { handleError } from "../error/handleError.js";

/**
 * Server version of handleWorkerRscStream - creates RSC streams directly without workers
 */
export const handleRscStream: HandleWorkerRscStreamFn = function _handleRscStream({
  message,
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

    // Create RSC stream using the helper
    const rscResult = createRscStream({
      route: message.route,
      pagePath: message.pagePath || "src/page/page.tsx", // Default fallback
      projectRoot: message.projectRoot || process.cwd(),
      moduleRootPath: message.moduleRootPath || "src",
      moduleBasePath: message.moduleBasePath || "/",
      moduleBaseURL: message.moduleBaseURL || "/",
      logger,
      verbose,
      panicThreshold,
      worker: undefined, // No worker in server mode
      rscWorkerPath: message.rscWorkerPath,
      clientPipeableStreamOptions: message.clientPipeableStreamOptions || {},
      serverPipeableStreamOptions: message.serverPipeableStreamOptions || {},
    });

    // Convert the server stream to a ReadableStream
    return new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          if (verbose) {
            logger?.info("[handleWorkerRscStream:server] Starting RSC stream conversion");
          }

          // Set up stream event handlers
          rscResult.stream.on("data", (chunk: Buffer) => {
            controller.enqueue(new Uint8Array(chunk));

            // Call onMetrics handler if provided
            if (handlers.onMetrics) {
              handlers.onMetrics(message?.id ?? message.route, {
                chunks: 1,
                bytes: chunk.length,
                startTime: Date.now(),
                backpressureCount: 0,
                errorCount: 0,
                duration: 0,
              });
            }
          });

          rscResult.stream.on("end", () => {
            controller.close();

            // Call onEnd handler if provided
            if (handlers.onEnd) {
              handlers.onEnd(message?.id ?? message.route);
            }

            if (verbose) {
              logger?.info("[handleWorkerRscStream:server] RSC stream completed");
            }
          });

          rscResult.stream.on("error", (error: unknown) => {
            controller.error(error);
          });

          // Start the RSC stream
          rscResult.pipe(process.stdout);
        } catch (error) {
          const panicError = handleError({
            error,
            logger,
            panicThreshold,
            context: "handleWorkerRscStream.server (stream start)",
          });
          
          if (panicError) {
            throw panicError;
          }
          
          controller.error(error);
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
    
    if (panicError) {
      throw panicError;
    }
    
    throw error;
  }
}; 