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
    let abortController = new AbortController();
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

    // Track when the stream drains
    htmlTransform.on("drain", () => {
      if (handlerOptions.verbose) {
        handlerOptions.logger.info(
          `[collectHtmlWorkerContent] Stream drained`
        );
      }
    });
    let writePromise: Promise<void> | undefined;
    let finished = false;

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
          reject(new Error(`Route processing timeout for ${handlerOptions.route}`));
        }
      }, handlerOptions.htmlTimeout); // Use configurable timeout
      let hasError = false;
      
      // Listen for abort signal
      abortController.signal.addEventListener('abort', () => {
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
        
        reject(new Error(abortController.signal.reason || "Build aborted"));
      });
      
      const messageHandler = (msg: HtmlWorkerOutputMessage) => {
        if (!worker) return reject(new Error("Worker is not a valid worker"));
        
        // CRITICAL: Only process messages for this specific route
        // This prevents race conditions when multiple routes are processed simultaneously
        if (msg.id !== handlerOptions.route) {
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
          
          // Set a timeout to reject if HTML_COMPLETE doesn't come within a reasonable time
          // This prevents hanging when the worker fails to send HTML_COMPLETE
          errorTimeout = setTimeout(() => {
            if (!finished) {
              if (handlerOptions.verbose) {
                handlerOptions.logger.info(
                  `[collectHtmlWorkerContent:${handlerOptions.route}] Error timeout reached, rejecting`
                );
              }
              const errorMessage = typeof msg.error === 'string' 
                ? msg.error 
                : msg.error?.message || 'Unknown error';
              reject(
                new Error(
                  `HTML generation failed for route ${handlerOptions.route}: ${errorMessage}`
                )
              );
            }
          }, 5000); // 5 second timeout
          
          return;
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
          // We should wait for the 'drain' event before continuing
          if (!writeResult) {
            if (handlerOptions.verbose) {
              handlerOptions.logger.info(
                `[collectHtmlWorkerContent] Stream backpressured, waiting for drain`
              );
            }
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
            if (handlerOptions.verbose)
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
          if ((routeComplete as any).generalTimeout) {
            clearTimeout((routeComplete as any).generalTimeout);
            (routeComplete as any).generalTimeout = null;
          }
          
          // Resolve the promise here since all HTML chunks have been processed
          // The file writer will complete when the stream ends
          resolve();

          if (worker)
            worker.postMessage({
              type: "CLEANUP",
              id: handlerOptions.route,
            } as CleanupMessage);
        } else if (msg.type === "ROUTE_FAILED") {
          if (handlerOptions.verbose)
            handlerOptions.logger.info(
              `[collectHtmlWorkerContent:${handlerOptions.route}] ROUTE_FAILED received: ${msg.reason}`
            );
          reject(new Error(`Route failed: ${msg.reason}`));
          return;
        } else if (msg.type === "CLEANUP_COMPLETE") {
          cleanup();
          // Don't resolve here - we should already have resolved on HTML_COMPLETE
          // This is just cleanup confirmation
        }
      };
      worker.on("message", messageHandler);
      function cleanup() {
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
