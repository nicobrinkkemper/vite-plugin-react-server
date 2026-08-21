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

    // The stream the fileWriter consumes, shared by both render modes.
    const htmlStream = new PassThrough();

    // Add error handler to prevent unhandled errors
    htmlStream.on('error', (error) => {
      // Ignore errors during abort - they're expected
      if (verbose) {
        logger?.info(`[createRenderToPipeableStreamHandler.client:${route}] HTML stream error (ignored): ${error.message}`);
      }
    });

    // Shared panic-policy mapping for a render error in either mode.
    const reportRenderError = (error: unknown) => {
      const panicError = handleError({
        error: error,
        logger: logger,
        panicThreshold: options.panicThreshold,
        context: `RSC stream onError for route ${route}`,
      });
      options.onEvent?.({
        type: "route.error",
        data: { route: route, error: panicError ?? error },
      });
    };

    let abortRender: () => void;
    if (options.prerender) {
      // STATIC prerender (SSG): react-dom/static waits for every Suspense
      // boundary and emits the FINAL markup inline — no fallback templates,
      // no hidden segments, no inline $RC swap scripts. The prerendered HTML
      // is the page, with or without JavaScript. This handler's chain is
      // SSG-only today, but the mode is FLAG-driven so a future live consumer
      // keeps streaming semantics by default.
      const controller = new AbortController();
      abortRender = () => controller.abort();
      void import("react-dom/static").then(
        async ({ prerenderToNodeStream }) => {
          try {
            const { prelude } = await prerenderToNodeStream(reactElements, {
              bootstrapModules:
                clientPipeableStreamOptions?.bootstrapModules || [],
              // A static file has no progressive delivery: without this,
              // React OUTLINES boundary content larger than the default
              // progressive chunk size (~12KB) behind a $RC swap script even
              // in a completed prerender — the exact shape this mode exists
              // to retire. Effectively infinite unless the consumer set one.
              progressiveChunkSize:
                (clientPipeableStreamOptions as { progressiveChunkSize?: number } | undefined)
                  ?.progressiveChunkSize ?? 1 << 30,
              signal: controller.signal,
              // Boundary errors: the render continues (the boundary falls
              // back) — same policy surface as the streaming onError.
              onError(error: unknown) {
                if (verbose) {
                  logger?.error(
                    `[createRenderToPipeableStreamHandler.client:${route}] React prerender error: ${error instanceof Error ? error.message : String(error)}`
                  );
                }
                reportRenderError(error);
              },
            } as never);
            prelude.pipe(htmlStream);
          } catch (error) {
            // A SHELL error REJECTS here (react-dom/static has no
            // onShellError seam). Destroy the output so downstream settles
            // (the guarded pipe below propagates), and route the panic logic.
            reportRenderError(error);
            htmlStream.destroy(
              error instanceof Error ? error : new Error(String(error))
            );
          }
        }
      );
      return buildResult();
    }

    // Create the React HTML stream using ReactDOMServer.renderToPipeableStream
    let rendererAborted = false;
    const { pipe, abort } = ReactDOMServer.renderToPipeableStream(reactElements, {
      bootstrapModules:
        clientPipeableStreamOptions?.bootstrapModules || [],
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

        // The output is dead, so stop React's render too: its work loop keeps
        // running the orphaned request otherwise (Suspense retries included),
        // and a retry that throws after the destination is gone has nowhere to
        // report — it escapes as an UNCAUGHT exception from React's internal
        // scheduler. Deferred so the current onError pass unwinds first, and
        // guarded because abort() itself reports through onError.
        if (!rendererAborted) {
          rendererAborted = true;
          setImmediate(() => {
            try {
              abort();
            } catch {
              // Already settled — nothing left to stop.
            }
          });
        }
        
        // Handle error according to panic threshold (shared mapping).
        reportRenderError(error);
      },
      // A SHELL error (thrown outside every Suspense boundary) also reaches
      // onError above, which destroys htmlStream and routes the panic logic.
      // This handler must still EXIST: without it React treats the shell error
      // as unhandled and re-throws it asynchronously from its work loop — an
      // uncaught exception escaping the whole pipeline even when the build
      // handled the error.
      onShellError(error: unknown) {
        if (verbose) {
          logger?.error(
            `[createRenderToPipeableStreamHandler.client:${route}] HTML shell render failed (nothing was piped): ${error instanceof Error ? error.message : String(error)}`
          );
        }
      },
    });

    abortRender = abort;

    // Pipe React into the REAL PassThrough — never a faked writable. React's
    // pipe() honors the write() return value and waits for 'drain' on
    // backpressure, so a no-op event emitter deadlocks every render whose
    // content arrives in a second flush (a Suspense boundary that actually
    // suspended, e.g. on a client-reference module import): the first flush
    // exhausts the fake capacity, the drain that would resume the flush can
    // never fire, and the SSG hangs with no error. Same lost-drain class the
    // html worker's handleHtmlRender fix removed — this was its last copy.
    pipe(htmlStream);

    if (verbose) {
      logger?.info(
        `[createRenderToPipeableStreamHandler.client:${route}] React stream piped to custom writable, using natural Node.js stream handling`
      );
    }

    return buildResult();

    // Both render modes hand the fileWriter the SAME contract over htmlStream:
    // the guarded pipe (propagates a pre-subscription render failure), abort,
    // and the raw stream/elements/metrics.
    function buildResult() {
      return {
      type: "client" as const,
      pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => {
        // A React render error destroys htmlStream (see onError above) — and it
        // can win the race against the consumer subscribing. Piping a dead
        // PassThrough emits neither data nor end, so a fileWriter waiting on
        // the pipeline would hang forever with the render error swallowed (the
        // silent SSG hang on a shell render error). Propagate instead: destroy
        // the destination with the render error — Node emits it on nextTick,
        // after the caller's synchronously-attached 'error' listeners are in
        // place — and forward any later error the same way (pipe() itself
        // never forwards errors downstream).
        const propagate = (error: unknown) => {
          const err =
            error instanceof Error
              ? error
              : new Error(String(error ?? `HTML render failed for ${route}`));
          const dest = destination as NodeJS.WritableStream & {
            destroy?: (e?: Error) => void;
          };
          // Absorb the crash if the caller has not subscribed yet (an 'error'
          // event with zero listeners is an uncaught exception); listeners the
          // caller does attach still receive the event.
          dest.on?.("error", () => {});
          if (typeof dest.destroy === "function") dest.destroy(err);
          else dest.emit?.("error", err);
        };
        if (htmlStream.destroyed) {
          propagate(htmlStream.errored ?? new Error(`HTML render failed for ${route}`));
          return destination;
        }
        htmlStream.on("error", propagate);
        htmlStream.pipe(destination);
        return destination;
      },
      abort: (reason?: unknown) => {
        try {
          abortRender();
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
    }
  };
