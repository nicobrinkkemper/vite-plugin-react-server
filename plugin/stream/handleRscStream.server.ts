import type { HandleRscStreamFn } from "./handleRscStream.types.js";
import { createRscStream } from "./createRscStream.server.js";
import { handleError } from "../error/handleError.js";
import { getNodeEnv } from "../config/getNodeEnv.js";
import { createUnifiedStreamHandler } from "../helpers/createUnifiedStreamHandler.js";

/**
 * Server-side RSC stream handler using unified stream management
 */
export const handleRscStream: HandleRscStreamFn<"server"> = function _handleRscStream({
  options,
  handlers,
}) {
  console.log('handleRscStream.server.ts called with options:', options);
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
    
    // Determine RSC variant based on HTML component/path
    const hasHtml = (options as any).htmlPath !== "" || (options as any).HtmlComponent;
    const rscVariant = hasHtml ? "rsc-full" : "rsc-headless";

    // Create unified stream handler for consistent management
    const unifiedStream = createUnifiedStreamHandler({
      route: options.route,
      id: requestId,
      streamType: "rsc",
      rscVariant,
      verbose,
      logger,
      panicThreshold,
      timeout: options.rscTimeout || 5000,
      onError: handlers.onError,
      onEnd: handlers.onEnd,
      onCleanup: undefined, // Not available in handlers type
      onEvent: undefined, // Not available in handlers type
    });

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

    // Pipe the RSC stream to the unified stream handler
    rscResult.rscStream.pipe(unifiedStream.stream as any);

    // Convert the unified stream to a ReadableStream
    return new ReadableStream<Uint8Array>({
      start(controller) {
        unifiedStream.stream.on("data", (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });

        unifiedStream.stream.on("end", () => {
          controller.close();
        });

        unifiedStream.stream.on("error", (error) => {
          controller.error(error);
        });

        unifiedStream.stream.on("abort", (reason) => {
          controller.error(new Error(String(reason || "Stream aborted")));
        });
      },
      cancel() {
        unifiedStream.abort();
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
      // Note: handlers.onEvent is not available in the type, so we skip it
      throw panicError;
    }

    throw error;
  }
};
