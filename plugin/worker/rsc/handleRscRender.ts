import { createRenderMetrics } from "../../helpers/metrics.js";
import { workerData } from "node:worker_threads";
import { PassThrough } from "node:stream";
import type { HandleRscRenderFn } from "./types.js";
import { createLogger } from "vite";
import {
  React,
  ReactDOMServer,
  type RenderToPipeableStreamOptions,
} from "../../vendor/vendor.server.js";
import { createElementWithReact } from "../../helpers/createElementWithReact.js";
import { checkReactExperimental } from "../../utils/checkReactVersion.js";
/**
 * Handles the rendering of React Server Component streams in the RSC worker thread.
 *
 * **Purpose**: Creates React Server Component streams using ReactDOMServer.renderToPipeableStream
 * and manages the stream lifecycle, error handling, and element reuse for performance optimization.
 *
 * **Key Features**:
 * - **Stream Creation**: Uses ReactDOMServer.renderToPipeableStream for RSC rendering
 * - **Error Handling**: Catches React rendering errors via onError callback and communicates to main thread
 * - **Stream Reuse**: Manages headless stream element reuse for performance optimization
 * - **Metrics Collection**: Tracks rendering performance and memory usage
 *
 * **Error Handling Strategy**:
 * - React rendering errors are caught by ReactDOMServer.onError callback
 * - Errors are sent to main thread via handlers.onError with context information
 * - Headless stream errors are tracked for conditional reuse logic
 * - Stream is properly ended even when errors occur
 *
 * **Stream Types**:
 * - **Headless Streams**: Page content only (no HTML wrapper) for .rsc files
 * - **Full Streams**: Complete HTML structure for HTML generation
 *
 * @param handlerOptions - Configuration options for RSC rendering
 * @param handlers - Event handlers for stream lifecycle management
 * @param rscStreamOverride - Optional override for RSC stream (for testing)
 * @param headlessStreamElements - Map for storing reusable headless stream elements
 * @param headlessStreamErrors - Map for tracking headless stream errors
 * @returns RSC stream result with metrics and lifecycle management
 */
export const handleRscRender: HandleRscRenderFn = function _handleRscRender(
  handlerOptions,
  handlers,
  rscStreamOverride,
  headlessStreamElements,
  headlessStreamErrors
) {
  const {
    id,
    route,
    verbose,
    reuseHeadlessStreamId,
    logger = createLogger(workerData.resolvedConfig?.logLevel ?? "info", {
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
          handlerOptions.HtmlComponent ? "present" : "undefined"
        }`
      );
    }
    // Check for reusable elements from headless stream
    let finalHandlerOptions = {
      moduleBase: workerData.userOptions.moduleBase || "",
      projectRoot: workerData.userOptions.projectRoot || process.cwd(),
      cssFiles: handlerOptions["cssFiles"] || new Map(),
      globalCss: handlerOptions["globalCss"] || new Map(),
      manifest: handlerOptions["manifest"] || {},
      ...handlerOptions,
    };
    if (reuseHeadlessStreamId && headlessStreamElements) {
      const reusableData = headlessStreamElements.get(reuseHeadlessStreamId);
      if (reusableData) {
        if (verbose) {
          logger?.info(
            `[rsc-worker:${route}] Found reusable stream from headless stream ${reuseHeadlessStreamId}`
          );
        }

        // Use the stored Root element directly for the full stream
        finalHandlerOptions = {
          ...finalHandlerOptions,
          // Don't override PageComponent, let the full stream create its own HTML structure
          // but we'll use the stored Root element instead of creating a new one
        };
      } else if (reuseHeadlessStreamId) {
        if (verbose) {
          logger?.info(
            `[rsc-worker:${route}] No reusable data found for headless stream ${reuseHeadlessStreamId}`
          );
        }
      }
    }

    const passThrough =
      rscStreamOverride || handlers.getWritable?.() || new PassThrough();

    // No need to collect chunks since we're storing the React element directly

    // Check if we should reuse a Page component from a headless stream
    let finalOptions = finalHandlerOptions;
    if (
      reuseHeadlessStreamId &&
      headlessStreamElements?.has(reuseHeadlessStreamId)
    ) {
      const reusableData = headlessStreamElements.get(reuseHeadlessStreamId);
      if (reusableData && !reusableData.errored) {
        // Use the stored Page component from the headless stream
        finalOptions = {
          ...finalHandlerOptions,
          PageComponent: reusableData.PageComponent,
        };
        if (verbose) {
          logger?.info(
            `[rsc-worker:${route}] Reusing Page component from headless stream ${reuseHeadlessStreamId}`
          );
        }
      }
    }

    // Use ReactDOMServer directly in the worker
    // For headless streams, use Fragment; for full streams, use the actual Html component
    const isHeadless = id.includes("headless");
    const element = createElementWithReact(React, {
      ...finalOptions,
      Html: isHeadless ? React.Fragment : finalOptions.HtmlComponent,
      as: isHeadless ? React.Fragment : "div",
    });
    if (verbose) {
      logger?.info(
        `[rsc-worker:${route}] About to render element for route: ${route}`
      );
      logger?.info(
        `[rsc-worker:${route}] Element to render: ${element ? Object.keys(element).length : 'null'} keys`
      );
      logger?.info(
        `[rsc-worker:${route}] Props: ${finalHandlerOptions ? Object.keys(finalHandlerOptions).length : 'null'} keys`
      );
    }

    // Set up completion detection logic before React callbacks
    const isMessagePortWritable = handlers.getWritable;

    if (verbose) {
      logger?.info(`[rsc-worker:${route}] isMessagePortWritable: ${!!isMessagePortWritable}`);
    }

    if (isMessagePortWritable) {
      // Two-port mode: The stream will complete naturally when React finishes
      // No manual completion logic needed - React will signal completion through proper stream events
      if (verbose) {
        logger?.info(`[rsc-worker:${route}] Two-port mode detected`);
      }
    } else {
      if (verbose) {
        logger?.info(`[rsc-worker:${route}] Single-port mode detected`);
      }
    }

    const {
      onPostpone: optionalOnPostpone,
      onError: optionalOnError,
      ...rest
    } = finalHandlerOptions["serverPipeableStreamOptions"] || {};
    const serverPipeableStreamOptions: RenderToPipeableStreamOptions = {
      ...rest,
      onPostpone: (reason: string) => {
        if (verbose) {
          logger?.info(
            `[rsc-worker:${route}] Component postponed (Suspense boundary): ${reason}`
          );
        }

        // onPostpone is for Suspense boundaries when components are deferred
        // This is not about backpressure - it's about lazy loading and component suspension
        // Handle through normal handler chain, not as a stream control signal

        if (handlers.onPostpone) {
          handlers.onPostpone(id, reason);
        }
        if (optionalOnPostpone) {
          optionalOnPostpone(reason);
        }
      },
      onError: (error: any) => {
        // Track headless stream errors for conditional reuse logic
        if (headlessStreamErrors && handlerOptions.htmlPath === "") {
          // This is a headless stream (htmlPath is empty), track the error
          headlessStreamErrors.set(route, error);
          if (verbose) {
            logger?.info(
              `[rsc-worker:${route}] Tracked headless stream error for route: ${route}`
            );
          }
        }



        // Send error through toWorker for metrics/logging
        if (verbose) {
          logger?.info(
            `[rsc-worker:${route}] Sending error to main thread: ${error.message}`
          );
        }
        handlers.onError(id, error, {
          route: route,
          context: "React stream error",
        });

        // Emit route.error event to allow main thread to handle panic threshold logic (like server-side)
        if (handlerOptions['onEvent']) {
          handlerOptions['onEvent']({
            type: "route.error",
            data: {
              error: error,
              route: route,
              panicThreshold: handlerOptions['panicThreshold']
            }
          });
        }

        // CRITICAL: Ensure stream is ended when error occurs to prevent hanging (like server-side does)
        // Use setImmediate to ensure the error handler completes before ending the stream
        setImmediate(() => {
          if ('destroyed' in passThrough && !passThrough.destroyed) {
            passThrough.end();
          }
        });

        if (optionalOnError) {
          if (verbose) {
            logger?.info(
              `[rsc-worker:${route}] Error handling completed, calling optionalOnError`
            );
          }
          optionalOnError(error);
        }

        if (verbose) {
          logger?.info(
            `[rsc-worker:${route}] onError handler finished - worker should continue normally`
          );
        }
      },
    } satisfies RenderToPipeableStreamOptions;

    if (verbose) {
      logger?.info(
        `[rsc-worker:${route}] *** CALLING renderToPipeableStream ***`
      );
    }

    checkReactExperimental();
    const { pipe } = ReactDOMServer.renderToPipeableStream(
      element,
      finalHandlerOptions.moduleBasePath,
      serverPipeableStreamOptions
    );

    if (verbose) {
      logger?.info(
        `[rsc-worker:${route}] *** renderToPipeableStream returned pipe function ***`
      );
    }

    if (verbose) {
      logger?.info(`[rsc-worker:${route}] *** CALLING pipe(passThrough) ***`);
    }

    pipe(passThrough);

    if (verbose) {
      logger?.info(
        `[rsc-worker:${route}] *** pipe(passThrough) call completed ***`
      );
    }

    // Two-port mode: React will naturally end the stream when done rendering
    if (isMessagePortWritable && verbose) {
      logger?.info(
        `[rsc-worker:${route}] Two-port mode: using standard pipe interface, React will call _final when complete`
      );
    }

    // Let errors flow through the stream naturally - main thread will handle them

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


    // Set up completion detection based on stream type

    // Set up completion detection for both single-port and two-port modes
    // Since onAllReady is not working in the patched version, use stream end event
    if (verbose) {
      logger?.info(
        `[rsc-worker:${route}] Setting up stream completion detection (onAllReady not working in patched version)`
      );
    }
    
    if (isMessagePortWritable) {
      // Two-port mode: monitor data flow
      if (verbose) {
        logger?.info(`[rsc-worker:${route}] Two-port mode detected`);
      }
    } else {
      // Single-port mode: Set up data-based completion detection

      passThrough.on("data", (chunk: Buffer) => {
        if (verbose) {
          logger?.info(
            `[rsc-worker:${route}] Single-port mode data chunk received: ${
              chunk.length
            } bytes, content: ${chunk.toString().substring(0, 100)}...`
          );
        }

        // Data chunk received

        if (verbose) {
          logger?.info(
            `[rsc-worker:${route}] Data chunk received, resetting completion timer. Chunk content: ${chunk
              .toString()
              .substring(0, 100)}...`
          );
        }

        // Call onData for both single-port and two-port communication
        handlers.onData(id, chunk);
        renderMetrics.streamMetrics.chunks++;
        renderMetrics.streamMetrics.bytes += chunk.length;

        // Data received
      });
    } // End of single-port mode else block

    // Unified stream end handler for both single-port and two-port modes
    passThrough.on("end", () => {
      if (verbose) {
        logger?.info(`[rsc-worker:${route}] *** STREAM END EVENT FIRED ***`);
      }


      // Stream completed naturally
      if (verbose) {
        logger?.info(
          `[rsc-worker:${route}] Stream completed naturally, checking for headless stream reuse`
        );
      }

      // Store Page component for reuse if this is a headless stream and no errors occurred
      if (
        headlessStreamElements &&
        id.includes("headless") &&
        !headlessStreamErrors?.has(route)
      ) {
        // This is a headless stream that completed successfully, store the Page component for reuse
        const dataToStore = {
          PageComponent: finalHandlerOptions["PageComponent"], // Store the Page component function
          errored: false,
        };
        headlessStreamElements.set(id, dataToStore);
        if (verbose) {
          logger?.info(
            `[rsc-worker:${route}] Stored Page component for headless stream ${id}`
          );
        }
      }

      // Call onEnd for both single-port and two-port communication
      // This mirrors the HTML worker pattern and ensures proper stream cleanup
      if (verbose) {
        logger?.info(
          `[rsc-worker:${route}] Calling handlers.onEnd(${id}) from end event to trigger completion`
        );
      }
      handlers.onEnd(id);
      renderMetrics.streamMetrics.duration =
        performance.now() - renderMetrics.streamMetrics.startTime;
      handlers.onMetrics(id, renderMetrics as any);
    });

    // Also handle the 'close' event as a fallback
    passThrough.on("close", () => {
      if (verbose) {
        logger?.info(`[rsc-worker:${route}] *** STREAM CLOSE EVENT FIRED ***`);
      }
      // Stream completed

      // Store Page component for reuse if this is a headless stream and no errors occurred
      if (
        headlessStreamElements &&
        id.includes("headless") &&
        !headlessStreamErrors?.has(route)
      ) {
        // This is a headless stream that completed successfully, store the Page component for reuse
        const dataToStore = {
          PageComponent: finalHandlerOptions["PageComponent"], // Store the Page component function
          errored: false,
        };
        headlessStreamElements.set(id, dataToStore);
        if (verbose) {
          logger?.info(
            `[rsc-worker:${route}] Stored Page component for headless stream ${id} (from close event)`
          );
        }
      }

      // Call onEnd for both single-port and two-port communication
      // This mirrors the HTML worker pattern and ensures proper stream cleanup
      if (verbose) {
        logger?.info(
          `[rsc-worker:${route}] Calling handlers.onEnd(${id}) from close event to trigger completion`
        );
      }
      handlers.onEnd(id);
      renderMetrics.streamMetrics.duration =
        performance.now() - renderMetrics.streamMetrics.startTime;
      handlers.onMetrics(id, renderMetrics as any);
    });

    passThrough.on("pipe", (src: any) => {
      if (verbose) {
        logger?.info(
          `[rsc-worker:${route}] *** STREAM PIPE EVENT FIRED *** readableEnded: ${src.readableEnded}`
        );
      }
    });

    passThrough.on("finish", () => {
      if (verbose) {
        logger?.info(`[rsc-worker:${route}] *** STREAM FINISH EVENT FIRED ***`);
      }
    });

    passThrough.on("error", (error: unknown) => {
      if (verbose) {
        logger?.error(`[rsc-worker:${route}] Stream error: ${error}`);
      }
      // Check if it's a Node.js stream with errored property
      if ("errored" in passThrough && passThrough.errored) {
        // already handled by the stream
        return;
      }
      // Send error through toWorker - let main thread handle panic threshold logic
      handlers.onError(id, error, {
        route: route,
        context: "RSC Stream Error",
      });

      // Ensure stream is properly ended when error occurs to prevent "Connection closed" errors
      handlers.onEnd(id);

      // Ensure stream is ended when error occurs to prevent hanging
      // Check if it's a Node.js stream with destroyed property
      if ("destroyed" in passThrough && !passThrough.destroyed) {
        passThrough.end();
      } else if ("end" in passThrough) {
        // For WritableStream that doesn't have destroyed property
        passThrough.end();
      }
    });

    if (verbose) {
      logger?.info(
        `[rsc-worker:${route}] Render setup complete for route: ${route} - function returning, worker should continue`
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

    // Send error through toWorker - let main thread handle panic threshold logic
    handlers.onError(id, error, {
      route: route,
      context: "RSC Worker Error",
    });

    // Call onEnd for both single-port and two-port communication
    handlers.onEnd(id);
  }
};
