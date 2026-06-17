import { workerData } from "node:worker_threads";
import { Writable } from "node:stream";
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
 * Handle the render of an HTML stream from RSC chunks, creates the stream once and pipes directly.
 *
 * This html render expects all components as a serialized rsc stream.
 *
 * It does not have to resolve components, it just renders the html.
 *
 * @param handlerOptions
 * @param handlers
 * @param logger
 */
export const handleHtmlRender: HandleHtmlRenderFn = function _handleHtmlRender(
  handlerOptions,
  handlers
) {
  const {
    route,
    id = route,
    rscStream, // Use the RSC stream id passed from the main thread
    moduleRootPath,
    moduleBaseURL,
    moduleBasePath,
    verbose,
    logger,
    projectRoot,
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

    // Construct the correct moduleRootPath using the projectRoot + moduleBasePath
    let resolvedModuleRootPath = moduleRootPath || "";

    if (typeof resolvedModuleRootPath !== "string") {
      throw new Error("moduleRootPath is required");
    } else if (!resolvedModuleRootPath.startsWith(projectRoot)) {
      resolvedModuleRootPath = join(projectRoot, resolvedModuleRootPath);
    }

    if (!resolvedModuleRootPath.endsWith(moduleBasePath)) {
      resolvedModuleRootPath = resolvedModuleRootPath + moduleBasePath;
    }
    if (moduleBasePath === "" && !resolvedModuleRootPath.endsWith("/")) {
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

    if (!rscStream.readable) {
      throw new Error("RSC stream is not readable");
    }

    // Convert RSC stream to React elements using createFromNodeStream (like client-side)
    const result = createFromNodeStream({
      rscStream: rscStream,
      moduleRootPath: resolvedModuleRootPath,
      moduleBasePath: moduleBasePath,
      moduleBaseURL: moduleBaseURL,
      logger,
    });

    const mergedPipeableStreamOptions = {
      ...workerData.userOptions?.clientPipeableStreamOptions,
      ...handlerOptions.clientPipeableStreamOptions,
    };
    // Render React elements to HTML stream using ReactDOMServer.renderToPipeableStream
    if (verbose) {
      logger.info(
        `[html-worker:${route}] clientPipeableStreamOptions: ${JSON.stringify(
          mergedPipeableStreamOptions
        )}`
      );
    }

    // Create the stream once and pipe directly with onData
    const { pipe } = ReactDOMServer.renderToPipeableStream(result.children, {
      ...mergedPipeableStreamOptions,
      onShellReady() {
        if (verbose) {
          logger.info(
            `[html-worker:${route}] Shell ready, starting to pipe HTML`
          );
        }
        if(handlers.onShellReady) {
          handlers.onShellReady(route);
        }
        if(mergedPipeableStreamOptions?.onShellReady) {
          mergedPipeableStreamOptions.onShellReady();
        }
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
          handlers.onMetrics(route, moduleResolutionMetric);
        }
        
        if(handlers.onAllReady) {
          handlers.onAllReady(route);
        }
        if(mergedPipeableStreamOptions?.onAllReady) {
          mergedPipeableStreamOptions.onAllReady();
        }
      },
      onError(error, errorInfo) {
        if (verbose) {
          logger.error(
            `[html-worker:${route}] React rendering error: ${error}`
          );
        }

        handlers.onError(route, error, errorInfo);
        if(handlers.onError) {
          handlers.onError(route, error, errorInfo);
        }
        if(mergedPipeableStreamOptions?.onError) {
          mergedPipeableStreamOptions.onError(error, errorInfo);
        }
      },
    });

    // Pipe React's HTML output into a REAL Writable. A plain object faking the
    // stream interface (no-op on/once/emit) breaks React's backpressure
    // protocol: React checks write()'s return value and, when it's falsy (a
    // large chunk over the highWaterMark), waits for a `drain` event before the
    // next flush. A no-op event emitter never fires `drain`, so a SUSPENDED
    // render — whose boundary content arrives in a second flush — never gets
    // resumed: onAllReady fires but the final flush (and end()) never run, so
    // handlers.onEnd is never sent. The main thread then never sees the HTML
    // stream end and the fileWriter hangs until the build's 15s abort. This
    // surfaced only past the first prerender batch, where backpressure reliably
    // kicks in. A real Writable drains synchronously (we call callback() inline)
    // and emits `drain`, so React resumes and end()/_final fire every time.
    const customWritable = new Writable({
      write(chunk: any, _encoding, callback) {
        handlers.onData(id, chunk);
        callback();
      },
      final(callback) {
        handlers.onEnd(id);
        callback();
      },
    });

    // Pipe the React stream directly to our writable
    pipe(customWritable);

    // Set up RSC stream error handling
    rscStream.on("error", (error) => {
      if (verbose) {
        logger.error(`[html-worker:${route}] RSC stream error: ${error}`);
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
