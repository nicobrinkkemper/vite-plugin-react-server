import { PassThrough } from "node:stream";
import { createLogger } from "vite";
import { workerData } from "node:worker_threads";
import { join } from "node:path";
import { createStreamMetrics } from "../../helpers/metrics.js";
import { handleError } from "../../error/handleError.js";
import {
  React,
  ReactDOMClient,
  ReactDOMServer,
} from "../../vendor/vendor.client.js";
import type { HandleHtmlRenderFn } from "./types.js";
import { assertNonReactServer } from "../../config/getCondition.js";

assertNonReactServer();

/**
 * Handle the render of an HTML stream from RSC chunks, creates a pass through stream and
 * calls the provided handlers to handle the stream.
 *
 * @param handlerOptions
 * @param handlers
 * @param logger
 */
export const handleHtmlRender: HandleHtmlRenderFn = function _handleHtmlRender(
  handlerOptions,
  handlers,
  logger = createLogger()
) {
  const {
    id,
    route,
    rscStream, // Use the RSC stream passed from the main thread
    moduleRootPath = workerData.userOptions.moduleRootPath,
    moduleBaseURL = workerData.userOptions.moduleBaseURL,
    verbose = Boolean(workerData.userOptions.verbose),
    htmlTimeout = workerData.userOptions.htmlTimeout || 15000,
  } = handlerOptions;

  try {
    if (verbose) {
      logger.info(`[html-worker:${route}] Creating HTML stream (${id})`);
    }

    if (!rscStream) {
      throw new Error("RSC stream is required for HTML rendering");
    }

    // Convert RSC stream to React elements using ReactDOMClient.createFromNodeStream
    //
    // IMPORTANT: ReactDOMClient comes from react-server-dom-esm/client.node
    // We have reverse-engineered our own types for this (plugin/types/react-server-dom-esm.d.ts)
    // because there's no official @types package for react-server-dom-esm
    //
    // ACTUAL SIGNATURE FROM SOURCE CODE (patches/react-server-dom-esm+0.0.1.patch:9437):
    // exports.createFromNodeStream = function (stream, moduleRootPath, moduleBaseURL, options)
    //
    // This takes 4 parameters:
    // 1. stream: NodeJS.ReadableStream - the RSC stream
    // 2. moduleRootPath: string - the module root path for resolving client modules
    // 3. moduleBaseURL: string - the module base URL for resolving client modules
    // 4. options: object - optional configuration (encodeFormAction, nonce, etc.)

    // Construct the correct moduleRootPath following the old code logic
    let resolvedModuleRootPath = moduleRootPath || "";
    const projectRoot = workerData.userOptions.projectRoot;

    if (typeof resolvedModuleRootPath !== "string") {
      throw new Error("moduleRootPath is required");
    } else if (!resolvedModuleRootPath.startsWith(projectRoot)) {
      resolvedModuleRootPath = join(projectRoot, resolvedModuleRootPath);
    }

    const moduleBasePath = workerData.userOptions.moduleBasePath || "";
    if (!resolvedModuleRootPath.endsWith(moduleBasePath)) {
      resolvedModuleRootPath = resolvedModuleRootPath + moduleBasePath;
    }
    if (moduleBasePath === "") {
      resolvedModuleRootPath = `${resolvedModuleRootPath}/`;
    }

    // Listen for abort events on the RSC stream to stop React processing
    rscStream.on("abort", () => {
      if (verbose) {
        logger.info(
          `[html-worker:${route}] RSC stream aborted, stopping React processing`
        );
      }
      // Call the HTML abort function to stop React's renderToPipeableStream
      _htmlAbort();
    });

    const elements = React.createElement(() =>
      React.use(
        ReactDOMClient.createFromNodeStream(
          rscStream,
          resolvedModuleRootPath,
          moduleBaseURL,
          
        )
      )
    );

    // Convert React elements to HTML using ReactDOMServer.renderToPipeableStream
    //
    // IMPORTANT: ReactDOMServer comes from react-dom/server (NOT react-server-dom-esm)
    // This has official @types/react-dom types, so the TypeScript definitions are trustworthy
    //
    // ACTUAL SIGNATURE FROM react-dom/server:
    // renderToPipeableStream(element, options)
    //
    // This takes 2 parameters:
    // 1. element: React.ReactNode - the React element to render
    // 2. options: object - optional configuration (onError, onShellReady, etc.)
    
    if (!ReactDOMServer) {
      throw new Error("ReactDOMServer is not available in this context. HTML rendering requires react-dom/server.");
    }
    
    const { pipe, abort: _htmlAbort } = ReactDOMServer.renderToPipeableStream(
      elements,
      {
        bootstrapModules:
          workerData.userOptions.serverPipeableStreamOptions
            ?.bootstrapModules || [],
        onAllReady: () => {
          if (verbose) {
            logger.info(`[html-worker:${route}] All ready`);
          }
        },
        onError: (error: unknown, errorInfo?: any) => {
          if (verbose) {
            logger.info(
              `[html-worker:${route}] React stream onError called with error: ${JSON.stringify(
                error
              )} and errorInfo: ${JSON.stringify(errorInfo)}`
            );
          }

          const panicError = handleError({
            error: error,
            errorInfo: errorInfo,
            logger: logger,
            panicThreshold: workerData.userOptions.panicThreshold,
            context: `React stream onError for route ${route}`,
          });

          // Only send ERROR message if this is a panic threshold error
          if (panicError != null) {
            handlers.onError(route, panicError, {
              componentStack: errorInfo?.componentStack,
              digest: errorInfo?.digest,
            });
          } else {
            // For non-panic errors (panicThreshold: "none"), just log the error and continue
            // Don't abort the stream to avoid recursive errors
            logger.error(
              typeof error === "string"
                ? error
                : (typeof error === "string" ? "" : (error as Error).stack ?? "") + "\n Component stack: " + (errorInfo?.componentStack ?? ""),
              { error: error as Error }
            );
            
            if (verbose) {
              logger.info(`[html-worker:${route}] Non-panic error, continuing without abort`);
            }
          }
        },
        onShellReady: () => {
          if (verbose) {
            logger.info(`[html-worker:${route}] Shell ready`);
          }
        },
        onShellError: (error: unknown) => {
          if (verbose) {
            logger.info(
              `[html-worker:${route}] Shell error: ${JSON.stringify(error)}`
            );
          }

          const panicError = handleError({
            error: error,
            logger: logger,
            panicThreshold: workerData.userOptions.panicThreshold,
            context: `React shell error for route ${route}`,
          });

          // Only send SHELL_ERROR message if this is a panic threshold error
          if (panicError != null) {
            handlers.onShellError(route, error as Error);
          } else {
            // For non-panic errors, just log and continue without aborting
            if (verbose) {
              logger.info(
                `[html-worker:${route}] Non-panic shell error, continuing: ${error}`
              );
            }
          }

          // Ensure the stream is ended so the worker can complete
          if (!passThrough.destroyed) {
            passThrough.end();
          }
        },
      }
    );

    const passThrough = new PassThrough();
    const streamMetrics = createStreamMetrics();

    // Add a timeout to ensure the stream completes even if React doesn't end it naturally
    const streamTimeout = setTimeout(() => {
      if (verbose) {
        logger.info(
          `[html-worker:${route}] Stream timeout reached, forcing completion`
        );
      }
      // Force stream completion if it hasn't ended naturally
      if (!passThrough.destroyed) {
        passThrough.end();
      }
    }, htmlTimeout);

    // Pipe the HTML stream to our pass through
    pipe(passThrough);

    passThrough.on("data", (chunk: Buffer) => {
      if (verbose) {
        logger.info(
          `[html-worker:${route}] Received data chunk: ${chunk.length} bytes`
        );
      }
      // Always process data - let React handle errors naturally in the stream
      handlers.onData(route, chunk);
      streamMetrics.chunks++;
      streamMetrics.bytes += chunk.length;
    });

    passThrough.on("end", () => {
      if (verbose) {
        logger.info(`[html-worker:${route}] Stream ended`);
      }
      // Clear the timeout since stream completed naturally
      clearTimeout(streamTimeout);

      // Send metrics
      handlers.onMetrics(route, streamMetrics);

      // Always ensure the stream is completed, even when errors occur
      handlers.onEnd(route);
    });

    passThrough.on("error", (error: Error) => {
      if (verbose) {
        logger.info(`[html-worker:${route}] Stream error: ${error.message}`);
      }

      // Clear the timeout since stream errored
      clearTimeout(streamTimeout);

      const panicError = handleError({
        error: error,
        logger: logger,
        panicThreshold: workerData.userOptions.panicThreshold,
        context: `HTML stream error for route ${route}`,
      });

      // Only send ERROR message if this is a panic threshold error
      if (panicError != null) {
        handlers.onError(route, panicError);
      }

      // Always ensure the stream is completed, even when errors occur
      handlers.onEnd(route);
    });
  } catch (error: any) {
    if (verbose) {
      logger.info(
        `[html-worker:${route}] Error in handleRender: ${error.message}`
      );
    }

    const panicError = handleError({
      error: error,
      logger: logger,
      panicThreshold: workerData.userOptions.panicThreshold,
      context: `HTML worker handleRender error for route ${route}`,
    });

    // Only send ERROR message if this is a panic threshold error
    if (panicError != null) {
      handlers.onError(route, panicError);
    }

    // Always ensure the stream is completed, even when errors occur
    handlers.onEnd(route);
  }
};
