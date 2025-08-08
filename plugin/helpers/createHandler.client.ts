import { DEFAULT_CONFIG } from "../config/defaults.js";
import { routeToURL } from "../utils/routeToURL.js";
import { PassThrough } from "node:stream";
import { createStreamMetrics } from "./metrics.js";
import { handleError } from "../error/handleError.js";
import { createLogger } from "vite";
import { createWorkerStream } from "./createWorkerStream.js";
import { React, ReactDOMClient } from "../vendor/vendor.client.js";
import type { CreateHandlerFn } from "./createHandler.types.js";
import { join } from "node:path";
import { assertNonReactServer } from "../config/getCondition.js";

assertNonReactServer();

/**
 * Setup rsc handler under client conditions, using the rsc-worker.
 * @param handlerOptions
 * @returns
 */
export const createHandler: CreateHandlerFn<"client"> =
  function _createHandlerClient(handlerOptions: any) {
    const url =
      handlerOptions.url ||
      routeToURL(
        handlerOptions.route,
        handlerOptions.moduleBaseURL ?? DEFAULT_CONFIG.MODULE_BASE_URL,
        handlerOptions?.build?.rscOutputPath ??
          DEFAULT_CONFIG.BUILD.rscOutputPath
      );

    // For now, use a placeholder worker stream since we can't create workers synchronously
    // This will be handled by the plugin infrastructure that calls this handler
    const workerStream = createWorkerStream({
      ...handlerOptions,
      url,
      workerPath:
        handlerOptions.rscWorkerPath || DEFAULT_CONFIG.RSC_WORKER_PATH,
      messageType: "RSC_RENDER",
      currentCondition: "react-client",
      reverseCondition: "react-server",
      worker: handlerOptions.worker || null, // Use provided worker or null
    });
    
    if (handlerOptions.verbose) {
      handlerOptions.logger?.info(
        `[createHandler.client:${handlerOptions.route}] htmlPath: "${handlerOptions.htmlPath}" (type: ${typeof handlerOptions.htmlPath})`
      );
    }
    handlerOptions.moduleRootPath =
      handlerOptions.moduleRootPath ??
      join(
        handlerOptions.projectRoot || process.cwd(),
        handlerOptions.build?.outDir || DEFAULT_CONFIG.BUILD.outDir,
        handlerOptions.build?.client || DEFAULT_CONFIG.BUILD.client
      );
    // Create React elements from the RSC stream using ReactDOMClient.createFromNodeStream
    const elements = React.createElement(() =>
      React.use(
        ReactDOMClient.createFromNodeStream(
          workerStream,
          handlerOptions.moduleRootPath,
          handlerOptions.moduleBaseURL || DEFAULT_CONFIG.MODULE_BASE_URL
        )
      )
    );

    // Create a pass through stream for enhanced handling
    const passThrough = new PassThrough();
    const streamMetrics = createStreamMetrics();
    const logger = handlerOptions.logger || createLogger();
    const verbose = handlerOptions.verbose || false;
    const route = handlerOptions.route;

    // Pipe the worker stream to our pass through
    workerStream.pipe(passThrough);

    // Add a timeout to ensure the stream completes even if React doesn't end it naturally
    const streamTimeout = setTimeout(() => {
      if (verbose) {
        logger.info(
          `[createHandler.client:${route}] Stream timeout reached, forcing completion`
        );
      }
      // Force stream completion if it hasn't ended naturally
      if (!passThrough.destroyed) {
        passThrough.end();
      }
    }, handlerOptions.rscTimeout || 3000);

    // Set up stream event handlers
    passThrough.on("data", (chunk: Buffer) => {
      if (verbose) {
        logger.info(
          `[createHandler.client:${route}] Received data chunk: ${chunk.length} bytes`
        );
      }
      streamMetrics.chunks++;
      streamMetrics.bytes += chunk.length;
    });

    passThrough.on("end", () => {
      if (verbose) {
        logger.info(`[createHandler.client:${route}] Stream ended`);
      }
      // Clear the timeout since stream completed naturally
      clearTimeout(streamTimeout);
      streamMetrics.duration = Date.now() - streamMetrics.startTime;
    });

    passThrough.on("error", (error: unknown) => {
      if (verbose) {
        logger.error(`[createHandler.client:${route}] Stream error: ${error}`);
      }

      // Clear the timeout since stream errored
      clearTimeout(streamTimeout);

      const panicError = handleError({
        error: error,
        logger: logger,
        panicThreshold: handlerOptions.panicThreshold || "none",
        context: `Client RSC stream error for route ${route}`,
      });

      if (panicError != null) {
        throw panicError;
      }
    });

    return {
      type: "client" as const,
      pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => {
        passThrough.pipe(destination);
        return destination;
      },
      abort: (reason?: unknown) => {
        passThrough.destroy(new Error(String(reason || "Aborted")));
      },
      stream: passThrough,
      elements: elements, // Return the React elements created from the RSC stream
      metrics: streamMetrics,
    };
  };
