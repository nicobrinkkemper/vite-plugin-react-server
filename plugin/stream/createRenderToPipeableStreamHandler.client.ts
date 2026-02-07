import type { CreateRenderToPipeableStreamHandlerFn } from "./createRenderToPipeableStreamHandler.types.js";
import { ReactDOMServer } from "../vendor/vendor.client.js";
import { assertNonReactServer } from "../config/getCondition.js";
import { createFromNodeStream } from "./createFromNodeStream.client.js";
import { createStreamMetrics } from "../metrics/createStreamMetrics.js";
import { handleError } from "../error/handleError.js";
import { PassThrough } from "node:stream";

assertNonReactServer();

/**
 * Client version of createRenderToPipeableStreamHandler.
 *
 * Strategy: Use simple Node.js stream APIs to naturally handle RSC-to-HTML conversion.
 * This follows the HTML worker pattern exactly - create a custom writable stream
 * and pipe the React stream directly to it, then provide a proper stream for fileWriter.
 */
export const createRenderToPipeableStreamHandler: CreateRenderToPipeableStreamHandlerFn<"client"> =
  function _createRenderToPipeableStreamHandler(options) {
    const {
      route,
      logger,
      verbose = false,
      rscStream,
      children,
      moduleRootPath,
      moduleBasePath,
      moduleBaseURL,
      clientPipeableStreamOptions,
    } = options;

    if (verbose) {
      logger?.info(
        `[createRenderToPipeableStreamHandler.client:${route}] Starting RSC-to-HTML conversion using natural Node.js streams`
      );
    }

    // Create stream metrics
    const streamMetrics = createStreamMetrics();

    // Get React elements - either from children or by converting RSC stream
    let reactElements: React.ReactElement;
    if (children) {
      if (verbose) {
        logger?.info(
          `[createRenderToPipeableStreamHandler.client:${route}] Using provided children directly`
        );
      }
      // Ensure children is a React element
      if (typeof children === 'string' || typeof children === 'number' || typeof children === 'boolean') {
        throw new Error(`[createRenderToPipeableStreamHandler.client:${route}] Children must be a React element, got: ${typeof children}`);
      }
      reactElements = children as React.ReactElement;
    } else if (rscStream) {
      if (verbose) {
        logger?.info(
          `[createRenderToPipeableStreamHandler.client:${route}] Converting RSC stream to React elements using natural Node.js streams`
        );
      }
      const result = createFromNodeStream({
        rscStream,
        moduleRootPath,
        moduleBasePath,
        moduleBaseURL,
        logger,
        verbose,
      });
      reactElements = result.children;
    } else {
      throw new Error(
        `[createRenderToPipeableStreamHandler.client:${route}] Either children or rscStream is required`
      );
    }

    if (verbose) {
      logger?.info(
        `[createRenderToPipeableStreamHandler.client:${route}] React elements ready, starting HTML rendering`
      );
    }

    // Create the React HTML stream using ReactDOMServer.renderToPipeableStream
    const { pipe, abort } = ReactDOMServer.renderToPipeableStream(reactElements, {
      bootstrapScripts:
        clientPipeableStreamOptions?.bootstrapScripts || [],
      onShellReady() {
        if (verbose) {
          logger?.info(
            `[createRenderToPipeableStreamHandler.client:${route}] Shell ready, starting to pipe HTML`
          );
        }
      },
      onAllReady() {
        if (verbose) {
          logger?.info(
            `[createRenderToPipeableStreamHandler.client:${route}] All ready, HTML rendering complete`
          );
        }
      },
      onError(error: unknown) {
        if (verbose) {
          logger?.error(
            `[createRenderToPipeableStreamHandler.client:${route}] React rendering error: ${error instanceof Error ? error.message : String(error)}`
          );
        }
        
        // Destroy the HTML stream with the error to prevent hanging
        if (verbose) {
          logger?.info(
            `[createRenderToPipeableStreamHandler.client:${route}] Destroying HTML stream due to React error`
          );
        }
        htmlStream.destroy(error instanceof Error ? error : new Error(String(error)));
        
        // Handle error according to panic threshold
        const panicError = handleError({
          error: error,
          logger: logger,
          panicThreshold: options.panicThreshold,
          context: `RSC stream onError for route ${route}`,
        });

        if (panicError != null) {
          // This is a panic threshold error, emit event to notify parent
          options.onEvent?.({
            type: "route.error",
            data: {
              route: route,
              error: panicError,
            },
          });
        } else {
          // For non-panic errors, just log and send event
          options.onEvent?.({
            type: "route.error",
            data: {
              route: route,
              error: error,
            },
          });
        }
      },
    });

    // Create a PassThrough stream that the fileWriter can consume
    // This follows the HTML worker pattern but provides a proper stream interface
    const htmlStream = new PassThrough();
    
    // Add error handler to prevent unhandled errors
    htmlStream.on('error', (error) => {
      // Ignore errors during abort - they're expected
      if (verbose) {
        logger?.info(`[createRenderToPipeableStreamHandler.client:${route}] HTML stream error (ignored): ${error.message}`);
      }
    });

    // Create a custom writable stream that pipes to our PassThrough
    // This ensures the stream is consumed to completion naturally
    const customWritable = {
      write(chunk: any, _encoding?: any, callback?: any) {
        // Pipe the chunk to our PassThrough stream
        htmlStream.write(chunk);
        if (callback) callback();
      },
      end(chunk?: any, _encoding?: any, callback?: any) {
        if (chunk) {
          htmlStream.write(chunk);
        }
        // End the PassThrough stream
        htmlStream.end();
        if (callback) callback();
      },
      destroy(error?: Error) {
        // Destroy the PassThrough stream with the error
        try {
          htmlStream.destroy(error);
        } catch (destroyError) {
          // Stream may already be destroyed, ignore
        }
      },
      on() {}, // No-op for event listeners
      once() {}, // No-op for event listeners
      emit() { return false; }, // No-op for event emitters
    };

    // Pipe the React stream directly to our custom writable
    // This ensures the stream is consumed to completion naturally
    pipe(customWritable as any);

    if (verbose) {
      logger?.info(
        `[createRenderToPipeableStreamHandler.client:${route}] React stream piped to custom writable, using natural Node.js stream handling`
      );
    }

    // Return a result that provides a proper stream for fileWriter
    return {
      type: "client" as const,
      pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => {
        // Pipe our PassThrough stream to the destination
        htmlStream.pipe(destination);
        return destination;
      },
      abort: (reason?: unknown) => {
        try {
          abort();
        } catch (error) {
          // React abort may already be called, ignore
        }
        try {
          htmlStream.destroy(new Error(String(reason || "Aborted HTML stream")));
        } catch (error) {
          // Stream may already be destroyed, ignore
        }
        if (verbose) {
          logger?.info(
            `[createRenderToPipeableStreamHandler.client:${route}] HTML stream aborted: ${reason}`
          );
        }
      },
      htmlStream: htmlStream,
      elements: reactElements,
      metrics: streamMetrics,
    };
  };
