import { PassThrough } from "node:stream";
import { createStreamMetrics } from "../helpers/metrics.js";
import { handleError } from "../error/handleError.js";
import { createLogger } from "vite";
import type { CreateRenderToPipeableStreamHandlerFn } from "./createRenderToPipeableStreamHandler.types.js";
import { assertNonReactServer } from "../config/getCondition.js";
import { ReactDOMServer } from "../vendor/vendor.client.js";
import { createFromNodeStream } from "./createFromNodeStream.client.js";

assertNonReactServer();

/**
 * Creates an HTML stream from React elements using ReactDOMServer.renderToPipeableStream.
 *
 * **Purpose**: Converts React elements to HTML markup for client-side rendering.
 * **When to use**:
 * - You have React elements and need to render them to HTML
 * - You're in a client environment (browser or client-side worker)
 * - You need to create HTML files or serve HTML content
 *
 * **Flow**: React Elements → HTML Stream
 *
 * @example
 * ```typescript
 * // Create HTML stream from React elements
 * const htmlHandler = createRenderToPipeableStreamHandler({
 *   route: "/about",
 *   logger: myLogger,
 *   // The handler will use createNodeStream to get React elements
 *   // from the provided options, then render them to HTML
 * });
 *
 * // Pipe to file or response
 * htmlHandler.pipe(fileStream);
 * ```
 *
 * @example
 * ```typescript
 * // Use with RSC stream to create HTML
 * const rscStream = createRscStream({ route: "/about" });
 * const htmlHandler = createRenderToPipeableStreamHandler({
 *   route: "/about",
 *   rscStream: rscStream.rscStream, // RSC stream will be converted to React elements
 * });
 * ```
 *
 * @param handlerOptions - Options for HTML stream creation
 * @returns HTML stream with pipe/abort interface
 */
export const createRenderToPipeableStreamHandler: CreateRenderToPipeableStreamHandlerFn<"client"> =
  function _createHtmlStreamHandler(handlerOptions) {
    const {
      route,
      logger = createLogger(),
      verbose = false,
      panicThreshold = "none",
      htmlTimeout = 15000,
      htmlStream,
      clientPipeableStreamOptions = {},
    } = handlerOptions;

    if (verbose) {
      logger.info(`[createHtmlStream:${route}] Starting HTML stream creation`);
    }

    // Create a pass through stream for enhanced handling
    const passThrough = (htmlStream as PassThrough) || new PassThrough();
    const streamMetrics = createStreamMetrics();
    streamMetrics.startTime = performance.now();
    const streamTimeout = setTimeout(() => {
      if (verbose) {
        logger.info(
          `[createHtmlStream:${route}] Stream timeout reached, forcing completion`
        );
      }
      if (!passThrough.destroyed) {
        passThrough.end();
      }
    }, htmlTimeout);
    // If rscStream is provided, use it; otherwise use createNodeStream
    if (!handlerOptions.rscStream) {
      throw new Error(
        "[createRenderToPipeableStreamHandler.client] rscStream is required"
      );
    }
    
    // For client builds, we need to convert RSC stream to React elements for HTML generation
    if (verbose) {
      logger.info(`[createRenderToPipeableStreamHandler.client:${route}] Converting RSC stream to React elements`);
    }
    
    const result = createFromNodeStream(handlerOptions as typeof handlerOptions & { rscStream: any });
    const children = result.children;

    if (!children) {
      throw new Error(
        "[createRenderToPipeableStreamHandler.client] children is required"
      );
    }
    // Create React stream with proper error handling
    const { pipe, abort } = ReactDOMServer.renderToPipeableStream(children, {
      ...clientPipeableStreamOptions,
      onAllReady: () => {
        if (verbose) {
          logger.info(`[createHtmlStream:${route}] All ready`);
        }
        clientPipeableStreamOptions.onAllReady?.();
      },
      onError: (error: unknown, errorInfo?: any) => {
        if (verbose) {
          logger.info(
            `[createHtmlStream:${route}] React stream onError: ${error}`
          );
        }

        const panicError = handleError({
          error: error,
          errorInfo: errorInfo,
          logger: logger,
          panicThreshold: panicThreshold,
          context: `HTML stream onError for route ${route}`,
        });

        if (panicError != null) {
          if (verbose) {
            logger.info(`[createHtmlStream:${route}] Panic error detected`);
          }
          // Emit panic error event
          handlerOptions.onEvent?.({
            type: "route.error",
            data: {
              route: route,
              error: panicError,
              isPanic: true,
            },
          });
        } else {
          // Log non-panic errors
          logger.error(`HTML stream error: ${error}`, {
            error: error as Error,
          });
        }

        clientPipeableStreamOptions.onError?.(error, errorInfo);
      },
      onShellReady: () => {
        if (verbose) {
          logger.info(`[createHtmlStream:${route}] Shell ready`);
        }
        clientPipeableStreamOptions.onShellReady?.();
      },
      onShellError: (error: unknown) => {
        if (verbose) {
          logger.info(`[createHtmlStream:${route}] Shell error: ${error}`);
        }

        const panicError = handleError({
          error: error,
          logger: logger,
          panicThreshold: panicThreshold,
          context: `HTML stream onShellError for route ${route}`,
        });

        if (panicError != null) {
          handlerOptions.onEvent?.({
            type: "route.error",
            data: {
              route: route,
              error: panicError,
              isPanic: true,
            },
          });
        }

        clientPipeableStreamOptions.onShellError?.(error);
      },
    });

    // Pipe the React stream to our pass through
    pipe(passThrough);

    // Set up stream event handlers for metrics collection
    passThrough.on("data", (chunk: Buffer) => {
      if (verbose) {
        logger.info(
          `[createHtmlStream:${route}] Received data chunk: ${chunk.length} bytes`
        );
      }
      streamMetrics.chunks++;
      streamMetrics.bytes += chunk.length;
    });

    passThrough.on("end", () => {
      if (verbose) {
        logger.info(`[createHtmlStream:${route}] Stream ended`);
      }
      clearTimeout(streamTimeout);
      streamMetrics.duration = performance.now() - streamMetrics.startTime;
      streamMetrics.endTime = performance.now();
    });

    passThrough.on("error", (error: Error) => {
      if (verbose) {
        logger.info(
          `[createHtmlStream:${route}] Stream error: ${error.message}`
        );
      }
      clearTimeout(streamTimeout);

      const panicError = handleError({
        error: error,
        logger: logger,
        panicThreshold: panicThreshold,
        context: `HTML stream error for route ${route}`,
      });

      if (panicError != null) {
        handlerOptions.onEvent?.({
          type: "route.error",
          data: {
            route: route,
            error: panicError,
            isPanic: true,
          },
        });
      }
    });

    // Handle backpressure
    passThrough.on("drain", () => {
      if (verbose) {
        logger.info(
          `[createHtmlStream:${route}] Stream drain - backpressure resolved`
        );
      }
    });

    // Track backpressure when write buffer is full
    const originalWrite = passThrough.write.bind(passThrough);
    passThrough.write = function (chunk: any, encoding?: any, callback?: any) {
      const result = originalWrite(chunk, encoding, callback);
      if (!result) {
        streamMetrics.backpressureCount++;
        if (verbose) {
          logger.warn(`[createHtmlStream:${route}] Backpressure detected`);
        }
      }
      return result;
    };

    return {
      type: "client" as const,
      pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => {
        passThrough.pipe(destination);
        return destination;
      },
      abort: (reason?: unknown) => {
        abort();
        passThrough.destroy(new Error(String(reason || "Aborted HTML stream")));
      },
      htmlStream: passThrough,
      elements: children,
      metrics: streamMetrics,
    };
  };
