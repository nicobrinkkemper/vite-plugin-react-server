import { createRenderMetrics } from "../../helpers/metrics.js";
import { handleError } from "../../error/handleError.js";
import { workerData } from "node:worker_threads";
import { createRenderToPipeableStreamHandler } from "../../stream/createRenderToPipeableStreamHandler.server.js";
import { PassThrough } from "node:stream";
import type { HandleRscRenderFn } from "./types.js";
import { createLogger } from "vite";
import { join } from "node:path";

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
    const baseDir = join(
      handlerOptions.build.outDir,
      handlerOptions.build.static
    );
    const hasHtml =
      handlerOptions.htmlPath !== "" || handlerOptions.HtmlComponent;
    const renderMetrics = createRenderMetrics({
      type: hasHtml ? "rsc-full" : "rsc-headless",
      route,
      fromMainThread: false,
      fromRscWorker: true,
      fromHtmlWorker: false,
      processingTime: 0,
      chunks: 0,
      ...(!hasHtml
        ? {
            fileName: hasHtml
              ? handlerOptions.build.htmlOutputPath
              : handlerOptions.build.rscOutputPath,
            outputPath: join(
              baseDir,
              route,
              handlerOptions.build.rscOutputPath
            ),
            baseDir,
            routePath: route.replace(/^\//, ""),
          }
        : null // rsc-full isn't written to file directly.
        ),
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
        passThrough.end();
      }
    }, handlerOptions.rscTimeout || 5000); // 5 second timeout

    passThrough.on("data", (chunk: Buffer) => {
      if (verbose) {
        logger?.info(
          `[rsc-worker:${route}] Received data chunk: ${chunk.length} bytes`
        );
      }
      // Always process data - let React handle errors naturally in the stream
      handlers.onData(id, chunk);
      renderMetrics.streamMetrics.chunks++;
      renderMetrics.streamMetrics.bytes += chunk.length;
    });

    passThrough.on("end", () => {
      if (verbose) {
        logger?.info(`[rsc-worker:${route}] Stream ended`);
      }
      // Clear the timeout since stream completed naturally
      clearTimeout(streamTimeout);

      // Always call onEnd to complete the stream
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
