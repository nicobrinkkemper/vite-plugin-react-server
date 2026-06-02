import { PassThrough } from "node:stream";
import type { CreateHandlerOptions } from "../types.js";
import type { RscRenderResult } from "./renderRscStream.types.js";
import { createStreamMetrics } from "../metrics/createStreamMetrics.js";
import { createReactElement } from "../helpers/createRscRenderHelpers.server.js";
import { checkReactVersion } from "../utils/checkReactVersion.js";
import { ReactDOMServer } from "../vendor/vendor.server.js";
import type { StreamHandlers } from "../worker/types.js";


/**
 * Intuitive RSC stream renderer that works on both client and server
 * 
 * Usage:
 * const result = renderRscStream(options, handlers);
 * 
 * // Pipe to any destination
 * result.rscStream.pipe(fileStream);
 * result.pipe(response); // convenience method
 * 
 * // Access the stream directly
 * result.stream.on('data', (chunk) => console.log(chunk));
 * 
 * // Abort if needed
 * result.abort('User cancelled');
 */
export function renderRscStream(
  options: CreateHandlerOptions,
  handlers?: Pick<StreamHandlers<"server">, "onError" | "onPostpone" | "onEnd" | "onData">
): RscRenderResult {
  const id = options.id || "";
  const route = options.route;
  const verbose = options.verbose || false;
  const logger = options.logger;

  try {
    // Create React element from options - wrap in try-catch to handle errors during element creation
    let reactElement;
    try {
      reactElement = createReactElement(options, {
        id,
        route,
        verbose,
        logger,
        reuseHeadlessStreamId: (options as any).reuseHeadlessStreamId,
        headlessStreamElements: (options as any).headlessStreamElements,
        headlessStreamErrors: (options as any).headlessStreamErrors,
      });
    } catch (elementError) {
      // Handle errors during React element creation
      if (verbose) {
        logger?.error(`[renderRscStream:${route}] Error creating React element: ${elementError}`);
      }
      
      // Call our error handler to process the error
      handlers?.onError?.(id, elementError, {
        route,
        context: "React Element Creation Error",
      });
      
      // Return empty stream on error - API remains consistent
      const errorStream = new PassThrough();
      errorStream.end();
      
      return {
        type: "server" as const,
        rscStream: errorStream,
        pipe: (destination: any) => errorStream.pipe(destination),
        abort: () => {},
        metrics: createStreamMetrics(),
      };
    }
    
    // Create the output stream - this is what users will pipe to destinations
    const rscStream = new PassThrough();
    const metrics = createStreamMetrics();

    if (verbose) {
      logger?.info(`[renderRscStream:${route}] Creating React stream for element`);
    }
    
    checkReactVersion();

    // Render React to stream - let it flow naturally like the RSC worker
    const reactStream = ReactDOMServer.renderToPipeableStream(
      reactElement,
      options.moduleBasePath || "",
      {
        ...options.serverPipeableStreamOptions,
        onError: (error: unknown) => {
          if (verbose) {
            logger?.error(`[renderRscStream:${route}] React stream error: ${error}`);
          }
          
          // Call our error handler to process the error
          handlers?.onError?.(id, error, {
            route,
            context: "React Stream Error",
          });
          
          // Emit route.error event to allow main thread to handle panic threshold logic (like client)
          if (options.onEvent) {
            options.onEvent({
              type: "route.error",
              data: {
                error: error,
                route: route,
                panicThreshold: options.panicThreshold
              }
            });
          }
          
          // CRITICAL: Don't let the error propagate further - this prevents uncaught exceptions
          // The error has been handled by our error handler, so we don't need to re-throw it
          
          // Ensure stream is ended when error occurs to prevent hanging (like RSC worker does)
          // Use setImmediate to ensure the error handler completes before ending the stream
          setImmediate(() => {
            if (!rscStream.destroyed) {
              rscStream.end();
            }
            // Also abort the React stream to ensure it stops producing data
            if (reactStream && typeof reactStream.abort === 'function') {
              reactStream.abort();
            }
          });
        },
        onPostpone: (reason: string) => {
          if (verbose) {
            logger?.info(`[renderRscStream:${route}] Stream postponed: ${reason}`);
          }
          handlers?.onPostpone?.(id, reason);
        },
      }
    );

    // Pipe React output to our stream - let streams end naturally like the RSC worker does
    reactStream.pipe(rscStream);
    
    // Handle stream errors naturally - don't force completion
    rscStream.on("error", (error) => {
      if (verbose) {
        logger?.error(`[renderRscStream:${route}] Stream error: ${error}`);
      }
    });

    // Return intuitive interface that works the same on client and server
    return {
      type: "server" as const,
      rscStream: rscStream, // Alias for compatibility with existing code
      pipe: (destination: any) => rscStream.pipe(destination), // Convenience method
      abort: (reason?: unknown) => {
        if (handlers?.onError) {
          handlers.onError(id, new Error(String(reason || "Stream aborted")), {
            route,
            context: "Stream Aborted",
          });
        }
        rscStream.end();
      },
      metrics,
    };
  } catch (error) {
    // Handle errors gracefully - always return a valid stream
    handlers?.onError?.(id, error, {
      route,
      context: "RSC Render Error",
    });

    // Return empty stream on error - API remains consistent
    const errorStream = new PassThrough();
    errorStream.end();
    
    return {
      type: "server" as const,
      rscStream: errorStream,
      pipe: (destination: any) => errorStream.pipe(destination),
      abort: () => {},
      metrics: createStreamMetrics(),
    };
  }
}



