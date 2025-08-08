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
import { createRscToHtmlStream } from "./rscToHtmlStream.server.js";
import { fileWriter } from "./fileWriter.js";
import { createWorkerStreamHandler } from "../helpers/createWorkerStreamHandler.js";
import type { HtmlWorkerOutputMessage } from "../worker/html/types.js";
import type { CleanupMessage } from "../worker/types.js";
import type { CollectHtmlContentFn } from "./types.js";
import { getNodeEnv } from "../config/getNodeEnv.js";
import { handleError } from "../error/handleError.js";

/**
 * Collects RSC content from the rscFull stream
 *
 * @param rscFull The stream containing the RSC content
 * @returns An async generator that yields progress updates and chunks, then returns the complete RSC content
 */
export const collectHtmlContent: CollectHtmlContentFn =
  async function _collectHtmlWorkerContent(rsc, handlerOptions) {
    const worker = handlerOptions.worker;
    if (!worker) throw new Error("Worker is not a valid worker");
    const metrics = createStreamMetrics();
    const startTime = performance.now();
    
    const rscToHtmlStream = createRscToHtmlStream({
      ...handlerOptions,
      signal: handlerOptions.signal, // Use the signal from handlerOptions directly
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
    let hasError = false;

        // Create a promise that resolves when the route is complete
    let routeComplete: Promise<void>;
    let routeResolve: () => void;
    let routeReject: (error: Error) => void;
    
    routeComplete = new Promise<void>((resolve, reject) => {
      routeResolve = resolve;
      routeReject = reject;
    });

    // Use our helper for worker stream handling
    const { cleanup: workerCleanup } = createWorkerStreamHandler({
      worker,
      route: handlerOptions.route,
      timeout: handlerOptions.htmlTimeout,
      signal: handlerOptions.signal,
      verbose: handlerOptions.verbose,
      panicThreshold: handlerOptions.panicThreshold,
      logger: handlerOptions.logger,
      context: "collectHtmlWorkerContent",
      onMessage: (msg: HtmlWorkerOutputMessage) => {
        if (!worker) return;

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

        // If we've already encountered an error, ignore subsequent messages
        if (hasError) {
          if (msg.type === "SHELL_ERROR") {
            htmlTransform.end();
            // The shell error is critical, and it comes after the error event.
            // it should upgrade the error to critical
            if (handlerOptions.verbose)
              handlerOptions.logger.info(
                `[collectHtmlWorkerContent:${handlerOptions.route}] SHELL_ERROR received, upgrading error to critical`
              );
            if (handlerOptions.onEvent) {
              const error =
                typeof msg.error === "string"
                  ? new Error(msg.error)
                  : msg.error;
              handlerOptions.onEvent({
                type: "route.shellError",
                data: {
                  route: handlerOptions.route,
                  error: error,
                },
              });
            }
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
            routeReject(panicError);
            return;
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
                errorInfo: msg.errorInfo ?? undefined,
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
          if(typeof msg.chunk === "object") {
            // transform the object to Uint8Array
            msg.chunk = new Uint8Array(msg.chunk);
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
            routeReject(new Error(
              `HTML generation failed for route ${handlerOptions.route}`
            ));
            return;
          }

          // If we had an error but HTML_COMPLETE indicates success, log it but continue
          if (hasError) {
            if (handlerOptions.verbose)
              handlerOptions.logger.info(
                `[collectHtmlWorkerContent:${handlerOptions.route}] HTML_COMPLETE succeeded despite previous error`
              );
          }

          if (worker)
            worker.postMessage({
              type: "CLEANUP",
              id: handlerOptions.route,
            } as CleanupMessage);
        } else if (msg.type === "CLEANUP_COMPLETE") {
          workerCleanup();
          // Resolve the promise when cleanup is complete
          routeResolve();
        } else if (msg.type === "SHUTDOWN_COMPLETE") {
          // Worker is shutting down, complete this route
          workerCleanup();
          routeResolve();
        }
      },
      onError: (error) => {
        hasError = true;
        rsc.abort(new Error("Build aborted"));
        routeReject(error as Error);
      },
      onComplete: () => {
        finished = true;
      }
    });



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
                         if (event.data.error)
               rsc.abort(
                  (event.data.error as Error)?.message ?? "Stream aborted"
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

      rsc.pipe(rscToHtmlStream);
      writePromise = fileWriter(
        htmlTransform,
        "html",
        handlerOptions,
                 handlerOptions.signal
      );

      await routeComplete;
      if (writePromise) await writePromise;
      rscToHtmlStream.destroy();
      htmlTransform.destroy();

      // Update metrics with backpressure count
      metrics.backpressureCount = backpressureCount;

      // Return final result
      return { pipe: rsc.pipe.bind(rsc), abort: rsc.abort.bind(rsc), metrics };
    } catch (error) {
      if (handlerOptions.verbose)
        handlerOptions.logger.info(
          `[collectHtmlWorkerContent:${
            handlerOptions.route
          }] Error: ${JSON.stringify(error)}`
        );
      rscToHtmlStream.destroy();
              rsc.abort(new Error("RSC Stream aborted"));
             // No need to abort signal since we're using rsc.abort() directly
      try {
        htmlTransform.end();
      } catch {
        throw error;
      }
      if (writePromise) {
        try {
          await writePromise;
        } catch {
          throw error;
        }
      }
      throw error;
    }
  };
