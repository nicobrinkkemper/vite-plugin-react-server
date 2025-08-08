
import { createStreamMetrics } from "../../helpers/metrics.js";
import { handleError } from "../../error/handleError.js";
import { workerData } from "node:worker_threads";
import { createHandler } from "../../helpers/createHandler.server.js";
import { PassThrough } from "node:stream";
import type { HandleRscRenderFn } from "./types.js";
import { createLogger } from "vite";


/**
 * Handle the render of an RSC stream, creates a pass through stream and
 * calls the provided handlers to handle the stream.
 * 
 * @param handlerOptions 
 * @param handlers 
 * @param logger 
 */
export const handleRscRender: HandleRscRenderFn = function _handleRscRender(
  handlerOptions,
  handlers,
  rscStreamOverride
) {
  const {
    id,
    route,
    verbose,
    logger = createLogger(workerData.resolvedConfig.logLevel ?? "info", {
      prefix: "vite:plugin-react-server/worker/rsc",
    }),
  } = handlerOptions;

  try {
    if (verbose) {
      logger?.info(`[rsc-worker:${route}] Creating RSC stream`);
      logger?.info(`[rsc-worker:${route}] htmlPath in handlerOptions: "${handlerOptions.htmlPath}" (type: ${typeof handlerOptions.htmlPath})`);
    }
    const passThrough = rscStreamOverride || new PassThrough();
    const reactStream = createHandler(handlerOptions);
    reactStream.pipe(passThrough);


    // Set up stream handling using our helper
    const streamMetrics = createStreamMetrics();

    // Add a timeout to ensure the stream completes even if React doesn't end it naturally
    const streamTimeout = setTimeout(() => {
      if (verbose) {
        logger?.info(
          `[rsc-worker:${route}] Stream timeout reached, forcing completion`
        );
      }
      // Force stream completion if it hasn't ended naturally
      if (!passThrough.destroyed) {
        passThrough.end();
      }
    }, handlerOptions.rscTimeout || 3000); // 3 second timeout

    passThrough.on("data", (chunk: Buffer) => {
      if (verbose) {
        logger?.info(
          `[rsc-worker:${route}] Received data chunk: ${chunk.length} bytes`
        );
      }
      // Always process data - let React handle errors naturally in the stream
      handlers.onData(id, chunk);
      streamMetrics.chunks++;
      streamMetrics.bytes += chunk.length;
    });

    passThrough.on("end", () => {
      if (verbose) {
        logger?.info(`[rsc-worker:${route}] Stream ended`);
      }
      // Clear the timeout since stream completed naturally
      clearTimeout(streamTimeout);

      // Always call onEnd to complete the stream
      handlers.onEnd(id);
      streamMetrics.duration = Date.now() - streamMetrics.startTime;
      handlers.onMetrics(id, streamMetrics);
    });

    passThrough.on("pipe", (src) => {
      if (verbose) {
        logger?.info(`[rsc-worker:${route}] Stream piped ${src.readableEnded}`);
      }
    });

    passThrough.on("close", () => {
      if (verbose) {
        logger?.info(`[rsc-worker:${route}] Stream closed`);
      }
    });

    passThrough.on("error", (error: unknown) => {
      if (verbose) {
        logger?.error(`[rsc-worker:${route}] Stream error: ${error}`);
      }
      if (passThrough.errored) {
        // already handled by the stream
        return;
      }
      const panicError = handleError({
        error,
        logger,
        panicThreshold: workerData.userOptions.panicThreshold,
        context: `RSC Stream Error (${route})`,
      });
      if (panicError) {
        handlers.onError(id, panicError);
      }
    });

    if (verbose) {
      logger?.info(
        `[rsc-worker:${route}] Render setup complete for route: ${route}`
      );
    }
  } catch (error) {
    if (verbose) {
      logger?.error(
        `[rsc-worker:${route}] Error in handleRender: ${
          (error as Error)?.message ?? "no message"
        }`
      );
    }

    // Handle error gracefully instead of throwing
    const panicError = handleError({
      error,
      logger,
      panicThreshold: workerData.userOptions.panicThreshold,
      critical: false,
      context: `RSC Worker Error (${route})`,
    });

    if (panicError != null) {
      handlers.onError(id, panicError);
    }

    // Always ensure the stream is completed, even when errors occur
    handlers.onEnd(id);
    
    // Re-throw the error so the message handler can send SHUTDOWN_COMPLETE
    throw error;
  }
};
