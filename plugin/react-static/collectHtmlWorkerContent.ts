/**
 * rscHandler.ts
 *
 * PURPOSE: Handles collecting HTML content from the htmlCompact stream
 *
 * This module:
 * 1. Collects HTML content from the rscFull stream (which includes <html> and <body> tags)
 * 2. Returns the complete HTML content when the stream is done
 * 3. Provides a clean interface for HTML handling
 */

import { Transform } from "node:stream";
import { createStreamMetrics } from "../metrics/createStreamMetrics.js";
import { createRscToHtmlStream } from "./rscToHtmlStream.js";
import { fileWriter } from "./fileWriter.js";
import type { HtmlWorkerOutputMessage } from "../worker/html/types.js";
import type { CleanupMessage } from "../worker/types.js";
import type { CollectHtmlWorkerContentFn } from "./types.js";
import { getNodeEnv } from "../config/getNodeEnv.js";
import { handleError } from "../error/handleError.js";

/**
 * Collects RSC content from the rscFull stream
 *
 * @param rscFull The stream containing the RSC content
 * @returns An async generator that yields progress updates and chunks, then returns the complete RSC content
 */
export const collectHtmlWorkerContent: CollectHtmlWorkerContentFn =
  async function* _collectHtmlWorkerContent(rsc, handlerOptions) {
    const rscStream = rsc.stream;
    const rscController = rsc.controller;
    const worker = handlerOptions.worker;
    if (!worker) throw new Error("Worker is not a valid worker");
    const metrics = createStreamMetrics();
    const startTime = performance.now();
    // Use the signal from handlerOptions if provided, otherwise create a new one
    let abortController = handlerOptions.signal
      ? { signal: handlerOptions.signal, abort: () => {} } // Dummy abort for external signal
      : new AbortController();
    const rscToHtmlStream = createRscToHtmlStream({
      ...handlerOptions,
      signal: abortController.signal,
    });
    const htmlTransform = new Transform({
      transform(chunk, _encoding, callback) {
        metrics.chunks++;
        if (handlerOptions.verbose) {
          handlerOptions.logger.info(
            `[collectHtmlWorkerContent] Transform chunk: ${chunk.length} bytes`
          );
        }
        callback(htmlTransform.errored, chunk);
      },
      flush(callback) {
        metrics.duration = performance.now() - startTime;
        if (handlerOptions.verbose) {
          handlerOptions.logger.info(
            `[collectHtmlWorkerContent] Transform flush: ${metrics.chunks} chunks, ${metrics.duration}ms`
          );
        }
        callback();
      },
    });

    let writePromise: Promise<void> | undefined;
    let finished = false;
    let backpressureCount = 0; // Track backpressure occurrences

    // Main promise for route completion or error
    let routeComplete: Promise<void>;
    let errorTimeout: NodeJS.Timeout | null = null;
    let generalTimeout: NodeJS.Timeout | null = null;

    routeComplete = new Promise<void>((resolve, reject) => {
      // Add a general timeout to prevent hanging indefinitely
      generalTimeout = setTimeout(() => {
        if (!finished) {
          if (handlerOptions.verbose) {
            handlerOptions.logger.info(
              `[collectHtmlWorkerContent:${handlerOptions.route}] General timeout reached, rejecting`
            );
          }
          reject(
            new Error(`Route processing timeout for ${handlerOptions.route}`)
          );
        }
      }, handlerOptions.htmlTimeout); // Use configurable timeout
      let hasError = false;

      // Listen for abort signal
      abortController.signal.addEventListener("abort", () => {
        if (handlerOptions.verbose) {
          handlerOptions.logger.info(
            `[collectHtmlWorkerContent:${handlerOptions.route}] Abort signal received, canceling build`
          );
        }

        // Clear any pending timeouts
        if (errorTimeout) {
          clearTimeout(errorTimeout);
          errorTimeout = null;
        }
        if (generalTimeout) {
          clearTimeout(generalTimeout);
          generalTimeout = null;
        }

        // Abort the RSC stream if possible
        if (rscController && typeof rscController.abort === "function") {
          rscController.abort(new Error("Build aborted"));
        }

        reject(new Error(abortController.signal.reason || "Build aborted"));
      });

      const messageHandler = (msg: HtmlWorkerOutputMessage) => {
        if (!worker) return reject(new Error("Worker is not a valid worker"));

        if (msg.type === "LOG_ERROR") {
          handlerOptions.logger.error(msg.message, { error: msg.error });
          return;
        }
        // CRITICAL: Only process messages for this specific route
        // This prevents race conditions when multiple routes are processed simultaneously
        // However, allow SHUTDOWN_COMPLETE messages with id "*" as they apply to all routes
        if (
          msg.id !== handlerOptions.route &&
          !(msg.type === "SHUTDOWN_COMPLETE" && msg.id === "*")
        ) {
          if (handlerOptions.verbose) {
            handlerOptions.logger.info(
              `[collectHtmlWorkerContent:${handlerOptions.route}] Ignoring message for route ${msg.id}: ${msg.type}`
            );
          }
          return;
        }

        if (handlerOptions.verbose)
          handlerOptions.logger.info(
            `[collectHtmlWorkerContent:${handlerOptions.route}] Message received: ${msg.type}`
          );

        if (msg.type === "SHUTDOWN_COMPLETE") {
          // Worker is shutting down, complete this route even after error
          cleanup();
          resolve();
          return;
        }
        // If we've already encountered an error, ignore subsequent messages
        // However, allow SHUTDOWN_COMPLETE messages to complete the function even after errors
        if (hasError) {
          if (msg.type === "SHELL_ERROR") {
            htmlTransform.end();
            // The shell error is critical, and it comes after the error event.
            // it should upgrade the error to critical
            if (handlerOptions.verbose)
              handlerOptions.logger.info(
                `[collectHtmlWorkerContent:${handlerOptions.route}] SHELL_ERROR received, upgrading error to critical`
              );
            reject(msg.error);
            return;
          }
          if (msg.type === "ALL_READY") {
            if (handlerOptions.verbose)
              handlerOptions.logger.info(
                `[collectHtmlWorkerContent:${handlerOptions.route}] ALL_READY received in error state`
              );
            // Don't resolve here - even in error state, we should wait for HTML_COMPLETE
            // The worker might still be able to generate HTML despite the error
            return;
          }
          if (handlerOptions.verbose)
            handlerOptions.logger.info(
              `[collectHtmlWorkerContent:${handlerOptions.route}] Ignoring ${msg.type} message due to previous error`
            );
          return;
        }

        if (msg.type === "ERROR") {
          hasError = true;
          const panicError = handleError({
            error: msg.error,
            logger: handlerOptions.logger,
            mode: getNodeEnv(),
            panicThreshold: handlerOptions.panicThreshold,
            critical: true,
            context: "collectHtmlWorkerContent",
          });
          if (panicError != null) {
            reject(panicError);
          }
          if (handlerOptions.verbose)
            handlerOptions.logger.info(
              `[collectHtmlWorkerContent:${handlerOptions.route}] ERROR received`
            );
          // Mark this route as failed for build tracking
          if (handlerOptions.onEvent) {
            const error =
              typeof msg.error === "string" ? new Error(msg.error) : msg.error;
            handlerOptions.onEvent({
              type: "route.error",
              data: {
                route: handlerOptions.route,
                error: error,
                errorInfo: msg.errorInfo,
              },
            });
          }
        }

        if (msg.type === "ALL_READY") {
          if (handlerOptions.verbose)
            handlerOptions.logger.info(
              `[collectHtmlWorkerContent:${handlerOptions.route}] ALL_READY received`
            );
          // Don't resolve here - wait for HTML_COMPLETE to ensure all chunks are processed
          // ALL_READY just means React is ready to stream, but chunks may still be coming
        }
        if (msg.type === "HTML_CHUNK" && !finished) {
          if (handlerOptions.verbose) {
            handlerOptions.logger.info(
              `[collectHtmlWorkerContent] Writing HTML chunk: ${msg.chunk.length} bytes`
            );
          }
          const writeResult = htmlTransform.write(msg.chunk);
          if (handlerOptions.verbose) {
            handlerOptions.logger.info(
              `[collectHtmlWorkerContent] Write result: ${writeResult}`
            );
          }
          // If write returns false, it means the stream is backpressured
          // In practice, this rarely happens since fileWriter processes chunks quickly
          if (!writeResult) {
            backpressureCount++;
            handlerOptions.logger.warn(
              `[collectHtmlWorkerContent] stream backpressured (unusual) - count: ${backpressureCount}`
            );
          }
        } else if (msg.type === "HTML_COMPLETE") {
          finished = true;

          // Clear the error timeout if it exists
          if (errorTimeout) {
            clearTimeout(errorTimeout);
            errorTimeout = null;
          }

          // End the htmlTransform stream to signal that all chunks have been sent
          htmlTransform.end();
          if (handlerOptions.verbose)
            handlerOptions.logger.info(
              `[collectHtmlWorkerContent:${handlerOptions.route}] HTML_COMPLETE received, ended htmlTransform`
            );

          // Check if the HTML generation was successful
          if (msg.success === false) {
            handlerOptions.logger.info(
              `[collectHtmlWorkerContent:${handlerOptions.route}] HTML_COMPLETE indicates failure, rejecting`
            );
            reject(
              new Error(
                `HTML generation failed for route ${handlerOptions.route}`
              )
            );
            return;
          }

          // If we had an error but HTML_COMPLETE indicates success, log it but continue
          if (hasError) {
            if (handlerOptions.verbose)
              handlerOptions.logger.info(
                `[collectHtmlWorkerContent:${handlerOptions.route}] HTML_COMPLETE succeeded despite previous error`
              );
          }

          // Clear the general timeout
          if (generalTimeout) {
            clearTimeout(generalTimeout);
            generalTimeout = null;
          }

          // Resolve the promise here since all HTML chunks have been processed
          // The file writer will complete when the stream ends
          resolve();

          if (worker)
            worker.postMessage({
              type: "CLEANUP",
              id: handlerOptions.route,
            } as CleanupMessage);
        } else if (msg.type === "CLEANUP_COMPLETE") {
          cleanup();
          // Don't resolve here - we should already have resolved on HTML_COMPLETE
          // This is just cleanup confirmation
        }
      };
      worker.on("message", messageHandler);
      function cleanup() {
        if (cleanupCalled) return; // Prevent double cleanup
        cleanupCalled = true;
        if (worker) worker.removeListener("message", messageHandler);
        finished = true;

        // Clear any pending timeouts
        if (errorTimeout) {
          clearTimeout(errorTimeout);
          errorTimeout = null;
        }
        if (generalTimeout) {
          clearTimeout(generalTimeout);
          generalTimeout = null;
        }
      }
    });

    let cleanupCalled = false;

    try {
      if (handlerOptions.onEvent) {
        const originalOnEvent = handlerOptions.onEvent;
        handlerOptions.onEvent = (event) => {
          if (handlerOptions.verbose) {
            handlerOptions.logger.info(
              `[collectHtmlWorkerContent:${handlerOptions.route}] Event: ${event.type}`
            );
            switch (event.type) {
              case "route.error":
                handlerOptions.logger.error(
                  `[collectHtmlWorkerContent:${
                    handlerOptions.route
                  }] Route error: ${JSON.stringify(event.data.error)}`
                );
                break;
              case "file.write.done":
                handlerOptions.logger.info(
                  `[collectHtmlWorkerContent:${handlerOptions.route}] File write done: ${event.data.fileType}`
                );
                handlerOptions.logger.info(
                  `[collectHtmlWorkerContent:${
                    handlerOptions.route
                  }] Preview: ${event.data.content.slice(0, 100)}...`
                );
            }
          }
          if (event.type === "route.error") {
            if (abortController && event.data.error)
              abortController.abort(
                event.data.error.message ?? "Stream aborted"
              );
          }
          if (
            event.type === "file.write.done" &&
            event.data.fileType === "html"
          ) {
            metrics.bytes = event.data.content.length;
          }
          originalOnEvent(event);
        };
      }

      rscStream.pipe(rscToHtmlStream);
      abortController = new AbortController();
      writePromise = fileWriter(
        htmlTransform,
        "html",
        handlerOptions,
        abortController.signal
      );

      await routeComplete;
      if (writePromise) await writePromise;
      rscToHtmlStream.destroy();
      htmlTransform.destroy();

      // Update metrics with backpressure count
      metrics.backpressureCount = backpressureCount;

      // Clear any pending timeouts on success
      if (errorTimeout) {
        clearTimeout(errorTimeout);
        errorTimeout = null;
      }
      if (generalTimeout) {
        clearTimeout(generalTimeout);
        generalTimeout = null;
      }

      return { type: "success", stream: rscStream, metrics };
    } catch (error) {
      if (handlerOptions.verbose)
        handlerOptions.logger.info(
          `[collectHtmlWorkerContent:${
            handlerOptions.route
          }] Error: ${JSON.stringify(error)}`
        );
      rscToHtmlStream.destroy();
      if (rscController && typeof rscController.abort === "function")
        rscController.abort(new Error("RSC Stream aborted"));
      if (abortController && !abortController.signal.aborted)
        abortController.abort(new Error("AbortController aborted"));
      try {
        htmlTransform.end();
      } catch {
        return {
          type: "error",
          error: error as Error,
        };
      }
      if (writePromise) {
        try {
          await writePromise;
        } catch {
          return {
            type: "error",
            error: error as Error,
          };
        }
      }
      return {
        type: "error",
        error: error as Error,
      };
    }
  };
