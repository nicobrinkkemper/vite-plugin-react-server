import { createRenderMetrics } from "../../helpers/metrics.js";
import { handleError } from "../../error/handleError.js";
import { workerData } from "node:worker_threads";
import { createRenderToPipeableStreamHandler } from "../../stream/createRenderToPipeableStreamHandler.server.js";
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
      logger?.info(
        `[rsc-worker:${route}] htmlPath in handlerOptions: "${
          handlerOptions.htmlPath
        }" (type: ${typeof handlerOptions.htmlPath})`
      );
      logger?.info(
        `[rsc-worker:${route}] HtmlComponent in handlerOptions: ${
          handlerOptions.HtmlComponent ? 'present' : 'undefined'
        }`
      );
    }
    const passThrough = rscStreamOverride || new PassThrough();
    const reactStream = createRenderToPipeableStreamHandler(handlerOptions);
    reactStream.pipe(passThrough);

    // Set up stream handling using our helper
    const hasHtml =
      handlerOptions.htmlPath !== "" || handlerOptions.HtmlComponent;
    
    // In dev mode, don't use file-based metrics at all - just track the stream
    const renderMetrics = createRenderMetrics({
      type: hasHtml ? "rsc-full" : "rsc-headless", 
      route,
      fromMainThread: false,
      fromRscWorker: true,
      fromHtmlWorker: false,
      processingTime: 0,
      chunks: 0,
      // No file paths in dev mode - we're not writing files
    });

    // Add a timeout to ensure the stream completes even if React doesn't end it naturally
    const streamTimeout = setTimeout(() => {
      if (verbose) {
        logger?.info(
          `[rsc-worker:${route}] Stream timeout reached, forcing completion`
        );
      }
      // Force stream completion if it hasn't ended naturally
      if (!passThrough.destroyed) {
        if (verbose) {
          logger?.info(`[rsc-worker:${route}] Forcing passThrough.end()`);
        }
        passThrough.end();
      }
    }, handlerOptions.rscTimeout || 2000); // 2 second timeout - even more aggressive

    // Also add a shorter timeout to detect if the stream is stuck
    const stuckTimeout = setTimeout(() => {
      if (verbose) {
        logger?.info(
          `[rsc-worker:${route}] Stream appears stuck, checking if we should force end`
        );
      }
      // If we haven't received any data in 1 second, force end
      if (!passThrough.destroyed && renderMetrics.streamMetrics.chunks === 0) {
        if (verbose) {
          logger?.info(
            `[rsc-worker:${route}] No data received, forcing stream end`
          );
        }
        passThrough.end();
      }
    }, 1000); // 1 second timeout to detect stuck streams

    passThrough.on("data", (chunk: Buffer) => {
      if (verbose) {
        logger?.info(
          `[rsc-worker:${route}] Received data chunk: ${chunk.length} bytes`
        );
      }
      // Clear the stuck timeout since we received data
      clearTimeout(stuckTimeout);
      
      // Always process data - let React handle errors naturally in the stream
      handlers.onData(id, chunk);
      renderMetrics.streamMetrics.chunks++;
      renderMetrics.streamMetrics.bytes += chunk.length;
      
      // Check if we should force end after receiving data (in case React doesn't end naturally)
      if (renderMetrics.streamMetrics.chunks > 0 && verbose) {
        logger?.info(`[rsc-worker:${route}] Received ${renderMetrics.streamMetrics.chunks} chunks, checking if stream should end`);
      }
    });

    passThrough.on("end", () => {
      if (verbose) {
        logger?.info(`[rsc-worker:${route}] Stream ended`);
      }
      // Clear the timeouts since stream completed naturally
      clearTimeout(streamTimeout);
      clearTimeout(stuckTimeout);

      // Always call onEnd to complete the stream
      if (verbose) {
        logger?.info(`[rsc-worker:${route}] Calling handlers.onEnd(${id})`);
      }
      handlers.onEnd(id);
      renderMetrics.streamMetrics.duration =
        performance.now() - renderMetrics.streamMetrics.startTime;
      handlers.onMetrics(id, renderMetrics as any);
    });

    // Also handle the 'close' event as a fallback
    passThrough.on("close", () => {
      if (verbose) {
        logger?.info(`[rsc-worker:${route}] Stream closed`);
      }
      // Clear the timeouts since stream completed
      clearTimeout(streamTimeout);
      clearTimeout(stuckTimeout);

      // Call onEnd if it hasn't been called yet
      if (verbose) {
        logger?.info(`[rsc-worker:${route}] Calling handlers.onEnd(${id}) from close event`);
      }
      handlers.onEnd(id);
      renderMetrics.streamMetrics.duration =
        performance.now() - renderMetrics.streamMetrics.startTime;
      handlers.onMetrics(id, renderMetrics as any);
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
      // Ensure stream is ended when error occurs to prevent hanging
      if (!passThrough.destroyed) {
        passThrough.end();
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

    if (panicError != null) {
      throw panicError;
    }
    throw new Error("RSC render failed", { cause: error });
  }
};

