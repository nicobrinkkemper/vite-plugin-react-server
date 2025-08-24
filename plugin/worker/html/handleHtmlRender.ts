import { PassThrough } from "node:stream";
import { createLogger } from "vite";
import { workerData } from "node:worker_threads";
import { join } from "node:path";
import { createStreamMetrics, createRenderMetrics } from "../../helpers/metrics.js";
import { handleError } from "../../error/handleError.js";
import type { HandleHtmlRenderFn } from "./types.js";
import { assertNonReactServer } from "../../config/getCondition.js";
import { createFromNodeStream } from "../../stream/createFromNodeStream.client.js";
import { ReactDOMServer } from "../../vendor/vendor.client.js";

import { createModuleResolutionMetrics } from "../../metrics/createModuleResolutionMetrics.js";

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
export const handleHtmlRender: HandleHtmlRenderFn =
  async function _handleHtmlRender(
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

      if (verbose) {
        logger.info(`[html-worker:${route}] Module resolution config:`);
        logger.info(`[html-worker:${route}]   projectRoot: ${projectRoot}`);
        logger.info(`[html-worker:${route}]   moduleRootPath: ${moduleRootPath}`);
        logger.info(`[html-worker:${route}]   moduleBasePath: ${workerData.userOptions.moduleBasePath}`);
        logger.info(`[html-worker:${route}]   moduleBaseURL: ${moduleBaseURL}`);
      }

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

      if (verbose) {
        logger.info(`[html-worker:${route}] Final resolvedModuleRootPath: ${resolvedModuleRootPath}`);
      }
      if(rscStream.destroyed || rscStream.closed || rscStream.readableAborted || rscStream.readableEnded){
        throw new Error("RSC stream is closed or aborted");
      }

      // Start measuring module resolution time
      const moduleResolutionStartTime = performance.now();

      const { children } = createFromNodeStream({
        rscStream,
        moduleRootPath: resolvedModuleRootPath,
        moduleBasePath: moduleBasePath,
        moduleBaseURL: moduleBaseURL,
        logger,
      });

      // Note: Module resolution metric will be emitted in onAllReady callback

      if (verbose) {
        logger.info(`[html-worker:${route}] Starting HTML render for route: ${route}`);
        logger.info(`[html-worker:${route}] Children to render: ${JSON.stringify(children)}`);
      }

      if (verbose) {
        logger.info(`[html-worker:${route}] Starting React rendering of RSC elements`);
      }

      // Create a pass through stream for enhanced handling
      const passThrough = handlerOptions.htmlStream || new PassThrough();
      
      // Create stream metrics and render metrics early, but don't start timing yet
      const streamMetrics = createStreamMetrics();
      const renderMetrics = createRenderMetrics({
        route,
        type: "html",
        fromMainThread: false,
        fromRscWorker: false,
        fromHtmlWorker: true,
        processingTime: 0,
        chunks: 0,
        streamMetrics,
      });
      
      // Create React stream from the complete HTML structure
      const { pipe, abort } = ReactDOMServer.renderToPipeableStream(
        children,
        {
          bootstrapModules: workerData.userOptions.serverPipeableStreamOptions?.bootstrapModules || [],
          onAllReady: () => {
            // Module resolution is complete when onAllReady is called
            const moduleResolutionTime = performance.now() - moduleResolutionStartTime;
            if (handlers.onMetrics) {
              const moduleResolutionMetric = createModuleResolutionMetrics({
                route,
                workerType: "html",
                resolutionTime: moduleResolutionTime,
                fromMainThread: false,
                fromRscWorker: false,
                fromHtmlWorker: true,
                description: `Module resolution for route ${route} (onAllReady)`,
              });
              handlers.onMetrics(id, moduleResolutionMetric);
            }
            
            // Module resolution is complete, metrics are already created
            
            if (verbose) {
              logger.info(`[html-worker:${route}] All ready`);
            }
          },
          onError: (error: unknown, errorInfo?: any) => {
            if (verbose) {
              logger.info(`[html-worker:${route}] React stream onError: ${error}`);
            }
            
            const panicError = handleError({
              error: error,
              errorInfo: errorInfo,
              logger: logger,
              panicThreshold: workerData.userOptions.panicThreshold,
              context: `React stream onError for route ${route}`,
            });

            if (panicError != null) {
              handlers.onError(id, panicError, {
                componentStack: errorInfo?.componentStack,
                digest: errorInfo?.digest,
              });
            }
          },
          onShellReady: () => {
            if (verbose) {
              logger.info(`[html-worker:${route}] Shell ready`);
            }
          },
          onShellError: (error: unknown) => {
            if (verbose) {
              logger.info(`[html-worker:${route}] Shell error: ${error}`);
            }
            
            const panicError = handleError({
              error: error,
              logger: logger,
              panicThreshold: workerData.userOptions.panicThreshold,
              context: `React stream onShellError for route ${route}`,
            });

            if (panicError != null) {
              handlers.onError(id, panicError);
            }
          },
        }
      );

      // Pipe the React stream to our pass through
      pipe(passThrough);

      // Set up stream event handlers for metrics collection
      let firstChunk = true;
      passThrough.on("data", (chunk: Buffer) => {
        if (verbose) {
          logger.info(`[html-worker:${route}] Received data chunk: ${chunk.length} bytes`);
        }
        
        // Start timing on the first data chunk
        if (firstChunk) {
          streamMetrics.startTime = performance.now();
          firstChunk = false;
        }
        
        // Always process data - let React handle errors naturally in the stream
        handlers.onData(id, chunk);
        if (streamMetrics) {
          streamMetrics.chunks++;
          streamMetrics.bytes += chunk.length;
        }
      });

      passThrough.on("end", () => {
        if (verbose) {
          logger.info(`[html-worker:${route}] Stream ended`);
        }
        
        // Update final metrics if they exist
        if (streamMetrics && renderMetrics) {
          streamMetrics.duration = performance.now() - streamMetrics.startTime;
          streamMetrics.endTime = performance.now();
          renderMetrics.processingTime = streamMetrics.duration;
          renderMetrics.chunks = streamMetrics.chunks;
          renderMetrics.chunkRate = streamMetrics.chunks / (streamMetrics.duration / 1000);
          renderMetrics.memoryUsage = process.memoryUsage();
          if('fileSize' in renderMetrics && !renderMetrics.fileSize) {
            renderMetrics.fileSize = streamMetrics.bytes;
          }
          
          // Send metrics
          handlers.onMetrics(id, renderMetrics as any);
        }

        // Always ensure the stream is completed, even when errors occur
        handlers.onEnd(id);
      });

      passThrough.on("error", (error: Error) => {
        if (verbose) {
          logger.info(`[html-worker:${route}] Stream error: ${error.message}`);
        }

        const panicError = handleError({
          error: error,
          logger: logger,
          panicThreshold: workerData.userOptions.panicThreshold,
          context: `HTML stream error for route ${route}`,
        });

        // Only send ERROR message if this is a panic threshold error
        if (panicError != null) {
          handlers.onError(id, panicError);
        }

        // Always ensure the stream is completed, even when errors occur
        handlers.onEnd(id);
      });

      // Handle backpressure
      passThrough.on("drain", () => {
        if (verbose) {
          logger.info(`[html-worker:${route}] Stream drain - backpressure resolved`);
        }
      });

      // Track backpressure when write buffer is full
      const originalWrite = passThrough.write.bind(passThrough);
      passThrough.write = function(chunk: any, encoding?: any, callback?: any) {
        const result = originalWrite(chunk, encoding, callback);
        if (!result && streamMetrics) {
          streamMetrics.backpressureCount++;
          if (verbose) {
            logger.warn(`[html-worker:${route}] Backpressure detected`);
          }
        }
        return result;
      };

      return {
        abort: (reason?: unknown) => {
          abort();
          passThrough.destroy(new Error(String(reason || "Aborted HTML stream")));
        },
        metrics: streamMetrics,
      };

    } catch (error) {
      if (verbose) {
        logger.error(`[html-worker:${route}] Error in handleHtmlRender: ${error}`);
      }

      const panicError = handleError({
        error: error,
        logger: logger,
        panicThreshold: workerData.userOptions.panicThreshold,
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
