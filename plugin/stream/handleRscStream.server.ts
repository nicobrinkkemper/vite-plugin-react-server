import type { HandleRscStreamFn } from "./handleRscStream.types.js";
import { createRscStream } from "./createRscStream.server.js";
import { handleError } from "../error/handleError.js";
import { getNodeEnv } from "../config/getNodeEnv.js";

/**
 * Server-side RSC stream handler
 */
export const handleRscStream: HandleRscStreamFn<"server"> = function _handleRscStream({
  options,
}) {
  // Note: worker parameter is ignored in server version
  const verbose = options.verbose;
  const logger = options.logger;
  const panicThreshold = options.panicThreshold;
  try {
    if (verbose) {
      logger?.info("[handleWorkerRscStream:server] Creating RSC stream directly");
    }
    
    // Debug: Log the options to see what we're working with
    if (verbose) {
      logger?.info(`[handleWorkerRscStream:server] Options: route=${options.route}, rscWorker=${!!(options as any).rscWorker}`);
    }

    // Create RSC stream using the helper - message is already CreateRscStreamOptions
    const requestId =
      options.id ??
      `${options.route}-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 11)}`;

    // Create RSC stream with unified stream management
    if (verbose) {
      logger?.info(`[handleWorkerRscStream:server] About to call createRscStream with worker=${!!(options as any).rscWorker}`);
    }
    const rscResult = createRscStream({
      ...options, 
      id: requestId,
      logger,
      verbose,
      panicThreshold,
      rscWorker: options.rscWorker, // Use rscWorker if provided
      loader: options.loader || (() => Promise.resolve({ default: {} })), // Add missing loader
    } as any);

    // Convert the RSC stream directly to a ReadableStream
    return new ReadableStream<Uint8Array>({
      start(controller) {
        rscResult.rscStream.on("data", (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });

        rscResult.rscStream.on("end", () => {
          controller.close();
        });

        rscResult.rscStream.on("error", (error) => {
          controller.error(error);
        });
      },
      cancel() {
        rscResult.abort?.();
      },
    });

  } catch (error) {
    const panicError = handleError({
      error,
      logger,
      mode: getNodeEnv(),
      panicThreshold,
      context: `Server RSC stream creation error for route ${options.route}`,
    });

    if (panicError != null) {
      throw panicError;
    }

    throw error;
  }
};
