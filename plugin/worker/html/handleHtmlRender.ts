import { PassThrough } from "node:stream";
import { createLogger } from "vite";
import { workerData } from "node:worker_threads";
import { join } from "node:path";
import { handleError } from "../../error/handleError.js";
import type { HandleHtmlRenderFn } from "./types.js";
import { assertNonReactServer } from "../../config/getCondition.js";

// Import React DOM Client for RSC stream processing
import { createFromNodeStream } from "../../stream/createFromNodeStream.client.js";

import { createModuleResolutionMetrics } from "../../metrics/createModuleResolutionMetrics.js";
import { ReactDOMServer } from "../../vendor/vendor.client.js";

assertNonReactServer();

/**
 * Handle the render of an HTML stream from RSC chunks, creates a pass through stream and
 * calls the provided handlers to handle the stream.
 *
 * This html render expects all components as a serialiazed rsc stream.
 *
 * It does not have to resolve components, it just renders the html.
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
    moduleRootPath = workerData.userOptions?.moduleRootPath,
    moduleBaseURL = workerData.userOptions?.moduleBaseURL,
    verbose = Boolean(workerData.userOptions?.verbose),
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
    const projectRoot = workerData.userOptions?.projectRoot;

    if (verbose) {
      logger.info(`[html-worker:${route}] Module resolution config:`);
      logger.info(`[html-worker:${route}]   projectRoot: ${projectRoot}`);
      logger.info(`[html-worker:${route}]   moduleRootPath: ${moduleRootPath}`);
      logger.info(
        `[html-worker:${route}]   moduleBasePath: ${workerData.userOptions?.moduleBasePath}`
      );
      logger.info(`[html-worker:${route}]   moduleBaseURL: ${moduleBaseURL}`);
    }

    if (typeof resolvedModuleRootPath !== "string") {
      throw new Error("moduleRootPath is required");
    } else if (!resolvedModuleRootPath.startsWith(projectRoot)) {
      resolvedModuleRootPath = join(projectRoot, resolvedModuleRootPath);
    }

    const moduleBasePath = workerData.userOptions?.moduleBasePath || "";
    if (!resolvedModuleRootPath.endsWith(moduleBasePath)) {
      resolvedModuleRootPath = resolvedModuleRootPath + moduleBasePath;
    }
    if (moduleBasePath === "") {
      resolvedModuleRootPath = `${resolvedModuleRootPath}/`;
    }

    if (verbose) {
      logger.info(
        `[html-worker:${route}] Final resolvedModuleRootPath: ${resolvedModuleRootPath}`
      );
    }

    // Start measuring module resolution time
    const moduleResolutionStartTime = performance.now();

    // Note: Module resolution metric will be emitted in onAllReady callback

    if (verbose) {
      logger.info(
        `[html-worker:${route}] Starting HTML render for route: ${route}`
      );
    }

    if (verbose) {
      logger.info(
        `[html-worker:${route}] Starting React rendering of RSC elements`
      );
    }

    // Create a pass through stream for enhanced handling
    const passThrough = handlerOptions.htmlStream || new PassThrough();

    // Convert RSC stream to React elements using createFromNodeStream (like client-side)
    const result = createFromNodeStream({
      rscStream: rscStream,
      moduleRootPath: resolvedModuleRootPath,
      moduleBasePath: workerData.userOptions?.moduleBasePath || "",
      moduleBaseURL: moduleBaseURL || "/",
      logger,
    });

     // Render React elements to HTML stream using ReactDOMServer.renderToPipeableStream
     const { pipe } = ReactDOMServer.renderToPipeableStream(
       result.children,
       {
         bootstrapModules:
           workerData.userOptions?.serverPipeableStreamOptions
             ?.bootstrapModules || [],
        onShellReady() {
          if (verbose) {
            logger.info(
              `[html-worker:${route}] Shell ready, starting to pipe HTML`
            );
          }

          // Pipe the HTML stream to our pass through
          pipe(passThrough);
        },
        onAllReady() {
          if (verbose) {
            logger.info(
              `[html-worker:${route}] All ready, HTML rendering complete`
            );
          }

          // Calculate module resolution time
          const moduleResolutionTime =
            performance.now() - moduleResolutionStartTime;

          // Send metrics
          if (handlers.onMetrics) {
            const moduleResolutionMetric = createModuleResolutionMetrics({
              route,
              workerType: "html",
              resolutionTime: moduleResolutionTime,
              fromMainThread: false,
              fromRscWorker: false,
              fromHtmlWorker: true,
              description: `Module resolution for route ${route}`,
            });
            handlers.onMetrics(id, moduleResolutionMetric);
          }
        },
        onError(error: unknown) {
          if (verbose) {
            logger.error(
              `[html-worker:${route}] React rendering error: ${error}`
            );
          }

          handlers.onError(id, error, {
            componentStack: undefined,
            digest: undefined,
          });
        },
      }
    );

    // Set up pass through event handlers
    passThrough.on("data", (chunk) => {
      handlers.onData(id, chunk);
    });

    passThrough.on("end", () => {
      handlers.onEnd(id);
    });

    passThrough.on("error", (error) => {
      handlers.onError(id, error, {
        componentStack: undefined,
        digest: undefined,
      });
    });

    // Set up RSC stream error handling
    rscStream.on("error", (error) => {
      if (verbose) {
        logger.error(
          `[html-worker:${route}] RSC stream error: ${error}`
        );
      }

      handlers.onError(id, error, {
        componentStack: undefined,
        digest: undefined,
      });
    });
  } catch (error) {
    if (verbose) {
      logger.error(
        `[html-worker:${route}] Error in handleHtmlRender: ${error}`
      );
    }

    const panicError = handleError({
      error: error,
      logger: logger,
      panicThreshold: workerData.userOptions?.panicThreshold,
      context: `HTML worker error for route ${route}`,
    });

    if (panicError != null) {
      handlers.onError(id, panicError, {
        componentStack: undefined,
        digest: undefined,
      });
    }

    throw error;
  }
};
