/**
 * rscToHtmlStream.ts
 *
 * PURPOSE: Transforms RSC stream to HTML stream via worker communication
 *
 * This module:
 * 1. Takes RSC stream as input
 * 2. Communicates with worker to transform RSC to HTML
 * 3. Returns a writeable stream of HTML content
 * 4. Handles worker message processing and error cases
 */
import { Transform } from "node:stream";
import { handleError } from "../error/handleError.js";
import type {
  HtmlRenderMessage,
  RscChunkMessage,
  RscEndMessage,
  AbortMessage,
} from "../worker/types.js";
import type { RscToHtmlStreamFn } from "./types.js";

/**
 * Creates a transform stream that converts RSC content to HTML via worker
 *
 * @param options The options for RSC to HTML conversion
 * @returns A transform stream that outputs HTML content
 */
export const createRscToHtmlStream: RscToHtmlStreamFn = (options) => {
  const {
    worker,
    route,
    moduleRootPath,
    moduleBasePath,
    moduleBaseURL,
    projectRoot,
    verbose,
    panicThreshold,
    url,
    serverPipeableStreamOptions,
    signal,
    logger,
  } = options;

  if (verbose) {
    logger?.info(
      `[createRscToHtmlStream:${route}] Creating RSC to HTML transform stream`
    );
  }

  // Create transform stream
  const transformStream = new Transform({
    transform(chunk, _encoding, callback) {
      // This transform function is called for each RSC chunk
      // We send the chunk to the worker and let the message handler push HTML content
      if (verbose) {
        logger?.info(
          `[createRscToHtmlStream:${route}] Sending RSC chunk, size: ${chunk.length} bytes`
        );
      }

      const rscChunkMessage: RscChunkMessage = {
        type: "RSC_CHUNK",
        id: route,
        chunk: chunk,
      };

      worker?.postMessage(rscChunkMessage);
      callback();
    },

    flush(callback) {
      // This is called when the input stream ends
      if (verbose) {
        logger?.info(
          `[createRscToHtmlStream:${route}] Input stream ended, sending RSC_END`
        );
      }

      const rscEndMessage: RscEndMessage = {
        type: "RSC_END",
        id: route,
      };

      worker?.postMessage(rscEndMessage);

      // Don't call callback yet - wait for worker to finish and send CLEANUP_COMPLETE
      // Store the callback to call it later when cleanup is complete
      (transformStream as any)._cleanupCallback = callback;
    },
  });

  let htmlChunkCount = 0;

  // Handle messages from worker
  const messageHandler = (message: any) => {
    if (verbose) {
      logger?.info(
        `[createRscToHtmlStream:${route}] Received message type: ${message.type}`
      );
    }

    switch (message.type) {
      case "HTML_RENDER_START":
        // Worker started processing RSC to HTML
        break;

      case "HTML_CHUNK":
        // Worker sent HTML chunk - push it to output stream
        htmlChunkCount++;
        if (verbose) {
          logger?.info(
            `[createRscToHtmlStream:${route}] Received HTML chunk ${htmlChunkCount}, size: ${message.chunk.length} bytes`
          );
        }
        transformStream.push(message.chunk);
        break;

      case "HTML_RENDER_END":
        // Worker finished rendering HTML
        if (verbose) {
          logger?.info(
            `[createRscToHtmlStream:${route}] HTML rendering completed`
          );
        }
        break;

      case "HTML_COMPLETE":
        // Worker finished HTML processing
        if (verbose) {
          logger?.info(
            `[createRscToHtmlStream:${route}] HTML processing complete`
          );
        }

        // End the stream since HTML processing is complete
        // Call the stored callback from flush
        const completeCallback = (transformStream as any)._cleanupCallback;
        if (completeCallback) {
          completeCallback();
        }

        transformStream.end();
        break;

      case "HTML_METRICS":
        // Worker sent metrics - ignore for now
        if (verbose) {
          logger?.info(
            `[createRscToHtmlStream:${route}] Received HTML metrics`
          );
        }
        break;

      case "CLEANUP_COMPLETE":
        // Worker finished cleanup - we can now end the stream
        if (verbose) {
          logger?.info(
            `[createRscToHtmlStream:${route}] Worker cleanup complete, ending stream`
          );
        }

        // Call the stored callback from flush
        const cleanupCallback = (transformStream as any)._cleanupCallback;
        if (cleanupCallback) {
          cleanupCallback();
        }

        transformStream.end();
        break;

      case "ERROR":
        // Worker encountered an error
        if (message.error != null) {
          if (verbose) {
            logger?.info(`[createRscToHtmlStream:${route}] Received ERROR message from worker: ${JSON.stringify(message.error)}`);
          }
          
          // Handle error according to panic threshold
          const panicError = handleError({
            error: message.error,
            logger: logger,
            panicThreshold: panicThreshold,
            context: `RSC to HTML stream error for route ${route}`,
          });
          
          if (panicError != null) {
            if (verbose) {
              logger?.info(`[createRscToHtmlStream:${route}] Panic threshold error, destroying stream with error: ${panicError.message}`);
            }
            // This is a panic threshold error, destroy the stream with the error
            transformStream.destroy(panicError);
            if (signal != null) {
              signal.throwIfAborted();
            }
          } else {
            // Non-panic error, just log it and continue
            if (verbose) {
              logger?.warn(
                `[createRscToHtmlStream:${route}] Non-panic error from worker: ${message.error.message}`
              );
            }
          }
        }
        break;

      default:
        if (verbose) {
          logger?.warn(
            `[createRscToHtmlStream:${route}] Unknown message type: ${message.type}`
          );
        }
    }
  };

  // Handle worker errors
  const errorHandler = (error: Error) => {
    if (verbose) {
      logger?.error(
        `[createRscToHtmlStream:${route}] Worker error: ${error.message}`
      );
    }
    transformStream.destroy(error);
  };

  // Set up message and error handlers
  worker?.on("message", messageHandler);
  worker?.on("error", errorHandler);

  // Send initial HTML_RENDER message to start the process
  const htmlRenderMessage: HtmlRenderMessage = {
    type: "HTML_RENDER",
    id: route,
    route,
    moduleRootPath,
    moduleBasePath,
    moduleBaseURL,
    projectRoot,
    verbose,
    panicThreshold,
    url,
    serverPipeableStreamOptions,
  };


  if (verbose) {
    logger?.info(
      `[createRscToHtmlStream:${route}] Sending HTML_RENDER message`
    );
  }

  worker?.postMessage(htmlRenderMessage);

  // Handle abort signal
  if (signal) {
    const abortHandler = () => {
      if (verbose) {
        logger?.info(`[createRscToHtmlStream:${route}] Abort signal received`);
      }

      const abortMessage: AbortMessage = {
        type: "ABORT",
        id: route,
        reason: signal.reason || "Aborted rsc to html stream",
      };

      worker?.postMessage(abortMessage);
      transformStream.destroy(signal.reason || new Error("Aborted rsc to html stream"));
    };

    signal.addEventListener("abort", abortHandler);

    // Clean up abort handler when stream ends
    transformStream.on("end", () => {
      signal.removeEventListener("abort", abortHandler);
    });
  }

  return transformStream;
};
