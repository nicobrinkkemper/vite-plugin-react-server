import { PassThrough } from "node:stream";
import { createLogger } from "vite";
import type { CreateHtmlStreamFn } from "./createHtmlStream.types.js";
import { createSerializableHandlerOptions } from "../helpers/createSerializableHandlerOptions.js";
import { toError } from "../error/toError.js";
import { serializeError } from "../error/serializeError.js";
import { createMessageChannels } from "./createMessageChannels.js";
import { createDrainQueue } from "./createDrainQueue.js";

/**
 * A null React hook dispatcher during worker SSR (`Cannot read properties of null
 * (reading 'useState')`) almost always means the worker resolved a "use client"
 * chunk that bundles its OWN copy of React, separate from the worker's
 * react-dom/server. Point the worker's moduleRootPath at the `--ssr` client build
 * (bare react/react-dom externals), not the browser bundle. Augment the message so
 * this isn't a cryptic dead end.
 */
function augmentHtmlWorkerError(error: Error): Error {
  if (
    /Cannot read properties of null \(reading '(use[A-Zёa-z]*|use)'\)/.test(
      error.message
    ) ||
    /null is not an object.*\.use[A-Z]/.test(error.message)
  ) {
    error.message +=
      "\n\n[vite-plugin-react-server] This null React hook dispatcher during HTML " +
      "rendering usually means the html-worker resolved a 'use client' chunk that " +
      "bundles its own React. Point the worker's moduleRootPath at the --ssr client " +
      "build (where react/react-dom are bare-specifier externals), not the browser " +
      "bundle that ships its own React copy.";
  }
  return error;
}

/**
 * Creates an HTML stream using a MessagePort for direct communication with the HTML worker
 */
export const createHtmlStream: CreateHtmlStreamFn = function _createHtmlStream(
  options
) {
  const {
    route,
    id = route,
    rscStream,
    htmlWorker,
    verbose = false,
    logger = createLogger(),
    onError,
    panicThreshold,
    htmlTimeout,
  } = options;

  if (verbose) {
    logger.info(
      `[createHtmlStream.server:${route}] Creating HTML stream with MessagePort`
    );
  }

  if (!htmlWorker) {
    throw new Error("HTML worker is required for server-side HTML streaming");
  }

  // Create two separate MessagePorts for clean separation of concerns
  const { dataPort1, dataPort2, controlPort1, controlPort2 } = createMessageChannels();

  // Create the HTML output stream
  const htmlStream = new PassThrough();
  // A render error destroys this stream (the ERROR message below) — and that
  // can happen BEFORE the consumer subscribes, e.g. a shell error that fires
  // while the build is still wiring the fileWriter. destroy(err) emits 'error';
  // with zero listeners Node treats it as an uncaught exception and kills the
  // process ("Unhandled 'error' event on PassThrough"), even though the error
  // is already reported through the onError/handleError channels. This local
  // listener only absorbs the crash — consumers that subscribed still get the
  // same event.
  htmlStream.on("error", () => {});

  // RSC input: held while the HTML output is backpressured. Input keeps
  // arriving during that pause, so the end of the input is not the end of
  // delivery: the end-of-input marker (null) goes to the worker after the
  // last held chunk, on the drain that follows. If the HTML stream ends or
  // is aborted during the pause there is no such drain, and the held chunks
  // and the marker are never sent: the HTML is done, nothing needs them.
  const rscQueue = createDrainQueue<unknown>(
    (chunk) => dataPort1.postMessage(chunk),
    () => {
      if (verbose) {
        logger.info(
          `[createHtmlStream.server:${route}] RSC input fully delivered to the worker`
        );
      }
      dataPort1.postMessage(null);
    }
  );

  // Data port - receives HTML data from worker
  const dataMessageHandler = (event: any) => {
    if (verbose) {
    }
    const data = event; // MessagePort events contain the data directly
    
    if (data === undefined) {

      return; // Ignore undefined messages
    }

    if (data === null) {
      // End of stream
      if (verbose) {
        logger.info(`[createHtmlStream.server:${route}] HTML stream ended by worker`);
      }
      htmlStream.end();

      // Clean up listeners and close ports when stream ends naturally
      cleanup();

      // Send cleanup message to worker to reset its internal state
      // This prevents race conditions between page renders
      htmlWorker.postMessage({ type: "CLEANUP", id: id, route: route });
    } else {
      // Raw HTML data from worker - write to stream
      if (verbose) {
        logger.info(`[createHtmlStream.server:${route}] Writing HTML chunk: ${data.length} bytes`);
      }
      
      // Check if the HTML stream is still writable before attempting to write
      if (htmlStream.destroyed || htmlStream.writableEnded) {
        if (verbose) {
          logger.info(`[createHtmlStream.server:${route}] HTML stream already ended, ignoring data chunk`);
        }
        return;
      }

      // Data received - stream is still active

      // Check if the HTML stream can accept more data (backpressure handling)
      const canWrite = htmlStream.write(data);

      if (!canWrite) {
        // HTML stream is backpressured, pause the worker
        if (verbose) {
          logger.info(
            `[createHtmlStream.server:${route}] HTML stream backpressured, pausing worker`
          );
        }
        rscQueue.pause();
        
        // Tell the worker to pause sending more data
        controlPort1.postMessage({ type: "PAUSE", id: id });

        // Listen for drain event to resume
        htmlStream.once("drain", () => {
          if (verbose) {
            logger.info(
              `[createHtmlStream.server:${route}] HTML stream drained, resuming worker`
            );
          }
          // RSC chunks held during the pause go first
          rscQueue.resume();
          // Tell worker it can resume sending data
          controlPort1.postMessage({ type: "RESUME", id: id });
        });
      }
      
    }
  };
  
  dataPort1.on('message', dataMessageHandler);

  // Control port
  const controlMessageHandler = (event: any) => {
  
    const message = event; // MessagePort events contain the data directly
    
    if (!message || typeof message !== 'object') {
     
      return; // Ignore invalid messages
    }
    

    switch (message.type) {
      case "READY":
        // The worker acknowledges each RSC chunk; delivery is paced by the
        // HTML output's backpressure, not by this message.
        break;
      case "END":
        // The render is over, so the render deadline has been met. The
        // stream itself ends on the null data message: HTML can still be
        // held behind a paused output, and it waits for its reader.
        if (verbose) {
          logger.info(
            `[createHtmlStream.server:${route}] Received END message, render complete; waiting for null data to end the stream`
          );
        }
        if (deadline) clearTimeout(deadline);
        break;
      case "ERROR":
        const error = augmentHtmlWorkerError(
          toError(message.error, message.errorInfo)
        );
        htmlStream.destroy(error);

        // Call the error callback if provided
        if (onError) {
          const isPanic = panicThreshold === "all_errors";
          onError(error, isPanic);
        }

        // Clean up listeners and close ports when stream is destroyed due to error
        cleanup();

        // Send cleanup message to worker to reset its internal state
        // This prevents race conditions between page renders
        htmlWorker.postMessage({ type: "CLEANUP", id: id, route: route });
        break;
      case "METRICS":
        break;
      case "HTML_RENDER_START":
        break;
      case "CLEANUP_COMPLETE":
        // Worker has completed cleanup - this is just a confirmation
        if (verbose) {
          logger.info(`[createHtmlStream.server:${route}] Worker cleanup completed for route ${message.id}`);
        }
        break;
      default:
        break;
    }
  };
  
  controlPort1.on('message', controlMessageHandler);

  // Send the HTML stream request to the worker with both MessagePorts
  htmlWorker.postMessage(
    {
      type: "INIT",
      id: route,
      dataPort: dataPort2,
      controlPort: controlPort2,
      options: createSerializableHandlerOptions(options),
    },
    [dataPort2, controlPort2] as any
  ); // Transfer both ports to the worker

  // If we have an RSC stream, pipe it to the worker via dataPort
  if (rscStream) {
    if (verbose) {
      logger.info(
        `[createHtmlStream.server:${route}] Piping RSC stream to HTML worker`
      );
    }

    // Pipe the RSC stream data directly to the worker via dataPort
    rscStream.on("data", (chunk) => rscQueue.push(chunk));
    rscStream.on("end", () => rscQueue.end());

    rscStream.on("error", (error) => {
      const serializedError = serializeError(error);
      controlPort1.postMessage({ type: "ERROR", error: serializedError });
      dataPort1.postMessage({ error: serializedError });
    });
  }

  // Unified cleanup function that handles listeners only
  // Let React manage the MessagePort lifecycle to prevent "Connection closed" errors
  const cleanup = () => {
    try {
      // Every termination path (natural end, worker ERROR, abort, deadline)
      // funnels through here — disarming the deadline here means an
      // intentional abort can't be followed by a misleading timeout error.
      // (`deadline` is declared below; message/abort callbacks only run
      // after the synchronous body finished initializing it.)
      if (deadline) clearTimeout(deadline);
      dataPort1.removeListener('message', dataMessageHandler);
      controlPort1.removeListener('message', controlMessageHandler);
      // Don't close ports - let React finish consuming and close naturally
    } catch (error) {
      // Ignore cleanup errors
    }
  };

  // Note: Process-level cleanup is handled by worker shutdown protocol

  // Render deadline: the worker must report the end of its render (END on
  // the control port, which no pause holds) within htmlTimeout. It covers
  // the render, not delivery: after END the timer is cleared for good, and
  // HTML still held behind a paused output waits for its reader. A render
  // that has not ended by then is in one of two states, told apart by
  // whether the output is backpressured:
  //  - Not backpressured: the worker is free to send and has not finished.
  //    Canonically a wedged render, a client reference whose dynamic import
  //    never settles, which sends neither END nor ERROR and would keep the
  //    consumer (the SSG fileWriter, a request handler) waiting forever.
  //  - Backpressured: the consumer is not reading, so the worker's output is
  //    paused and RSC input is held back from it until the output drains. A
  //    render that still needs that input cannot finish; a wedged render
  //    looks the same from here.
  // The end of the RSC input is no guard for either: a fully delivered input
  // is exactly the state the canonical wedge is in when it hangs. Destroying
  // with a named error rides the same propagation path as worker-reported
  // render errors.
  const deadline =
    typeof htmlTimeout === "number" && htmlTimeout > 0
      ? setTimeout(() => {
          if (htmlStream.writableEnded || htmlStream.destroyed) return;
          htmlStream.destroy(
            new Error(
              `[createHtmlStream:${route}] HTML render did not complete within ${htmlTimeout}ms — ` +
                (htmlStream.writableNeedDrain
                  ? `its output is not being read, so the html worker is paused and RSC input ` +
                    `is held back until the output drains. A render that still needs that ` +
                    `input cannot finish while the consumer does not read; a wedged render ` +
                    `looks the same from here.`
                  : `the html worker neither finished rendering nor reported an error. A client-reference ` +
                    `module that fails to load at render time can wedge the render this way; ` +
                    `check that the client build output is resolvable from the render.`)
            )
          );
          cleanup();
        }, htmlTimeout)
      : undefined;
  deadline?.unref?.();
  htmlStream.on("close", () => {
    if (deadline) clearTimeout(deadline);
  });

  return {
    pipe: (destination: any) => {
      // A render error destroys htmlStream (the worker's ERROR message) — and
      // that can happen BEFORE the consumer pipes. Piping a dead PassThrough
      // emits neither data nor end, so a fileWriter waiting on the pipeline
      // sits until an outer abort timer fires and the REAL component error is
      // replaced by a generic timeout. Propagate instead: destroy the
      // destination with the render error (Node emits it on nextTick, after
      // the caller's synchronously-attached listeners are in place) and
      // forward any later error the same way — pipe() itself never forwards
      // errors downstream. Same treatment as the client-side handler.
      const propagate = (error: unknown) => {
        const err =
          error instanceof Error
            ? error
            : new Error(String(error ?? `HTML render failed for ${route}`));
        const dest = destination as NodeJS.WritableStream & {
          destroy?: (e?: Error) => void;
        };
        dest.on?.("error", () => {});
        if (typeof dest.destroy === "function") dest.destroy(err);
        else dest.emit?.("error", err);
      };
      if (htmlStream.destroyed) {
        propagate(
          htmlStream.errored ?? new Error(`HTML render failed for ${route}`)
        );
        return destination;
      }
      htmlStream.on("error", propagate);
      return htmlStream.pipe(destination);
    },
      abort: () => {
    controlPort1.postMessage({ type: "ABORT", reason: "Stream aborted" });
    htmlStream.end();

    // Use unified cleanup
    cleanup();

    // Send cleanup message to worker to reset its internal state
    // This prevents race conditions between page renders
    htmlWorker.postMessage({ type: "CLEANUP", id: id, route: route });
  },
  };
};
