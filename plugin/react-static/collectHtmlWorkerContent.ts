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
import { logError } from "../error/logError.js";
import type { CleanupMessage } from "../worker/types.js";
import type { CollectHtmlWorkerContentFn } from "./types.js";

/**
 * Collects RSC content from the rscFull stream
 *
 * @param rscFull The stream containing the RSC content
 * @returns A promise that resolves with the complete RSC content
 */
export const collectHtmlWorkerContent: CollectHtmlWorkerContentFn =
  async function _collectHtmlWorkerContent(rsc, handlerOptions) {
    const rscStream = rsc.stream;
    const rscController = rsc.controller;
    if (!handlerOptions.worker) {
      throw new Error("Worker is not a valid worker");
    }
    const metrics = createStreamMetrics();
    const startTime = performance.now();

    // Create RSC to HTML transform stream
    const rscToHtmlStream = createRscToHtmlStream({
      worker: handlerOptions.worker,
      route: handlerOptions.route,
      moduleRootPath: handlerOptions.moduleRootPath,
      moduleBaseURL: handlerOptions.moduleBaseURL,
      pipeableStreamOptions: handlerOptions.pipeableStreamOptions,
      build: handlerOptions.build,
      cssFiles: handlerOptions.cssFiles,
      projectRoot: handlerOptions.projectRoot,
    });

    // Create transform stream to handle HTML chunks and file writing
    const htmlTransform = new Transform({
      transform(chunk, _encoding, callback) {
        metrics.chunks++;
        callback(null, chunk);
      },
      flush(callback) {
        metrics.duration = performance.now() - startTime;
        callback();
      },
    });

    let isComplete = false;
    let hasError = false;
    let writePromise: Promise<void> | undefined;
    let routeResolved = false;
    let abortController: AbortController | undefined;

    // Create a promise that resolves when the route is complete
    const routeComplete = new Promise<void>((resolve, reject) => {
      if (!handlerOptions.worker) {
        throw new Error("Worker is not a valid worker");
      }
      const messageHandler = (msg: HtmlWorkerOutputMessage) => {
        if (!handlerOptions.worker) {
          reject(new Error("Worker is not a valid worker"));
          return;
        }
        if(handlerOptions.verbose
        ) {
          handlerOptions.logger.info(`[collectHtmlWorkerContent] Message received: ${msg.type}`);
          if(msg.type === "HTML_CHUNK") {
            handlerOptions.logger.info(`[collectHtmlWorkerContent] HTML_CHUNK: ${Buffer.from(msg.chunk).toString("utf-8").slice(0, 200)}`);
          }
        }
        switch (msg.type) {
          case "HTML_CHUNK":
            if (!isComplete) {
              htmlTransform.write(msg.chunk);
            }
            break;
          case "HTML_COMPLETE":
            isComplete = true;
            // End the transform stream
            htmlTransform.end();
            if (handlerOptions.verbose) {
              handlerOptions.logger.info(`[collectHtmlWorkerContent] HTML_COMPLETE received, ended htmlTransform`);
            }
            // Send cleanup message to worker
            handlerOptions.worker.postMessage({
              type: "CLEANUP",
              id: handlerOptions.route,
            } satisfies CleanupMessage);
            break;
          case "CLEANUP_COMPLETE":
            if (!routeResolved) {
              routeResolved = true;
              handlerOptions.worker.removeListener("message", messageHandler);
              resolve();
            }
            break;
          case "ERROR":
            if (!hasError) {
              hasError = true;
              
              // Log the error with proper formatting and errorInfo
              if (msg.errorInfo?.componentStack) {
                logError(msg.errorInfo.componentStack, handlerOptions.logger);
              }
              logError(msg.error, handlerOptions.logger);
              
              // Cancel the file write operation
              if (abortController) {
                abortController.abort();
              }
              
              // End the transform stream properly to allow fileWriter to complete
              htmlTransform.end();
              
              // Destroy the RSC to HTML transform stream to stop sending chunks to worker
              rscToHtmlStream.destroy();
              
              // Abort the RSC stream at the source to prevent further chunks and stale content
              if (rscController && typeof rscController.abort === 'function') {
                rscController.abort('HTML worker encountered error');
              }
              
              handlerOptions.worker.removeListener("message", messageHandler);
              
              // Send cleanup message to worker to clear its state
              handlerOptions.worker.postMessage({
                type: "CLEANUP",
                id: handlerOptions.route,
              } satisfies CleanupMessage);
              
              // Reject with the error to signal failure
              if (!routeResolved) {
                routeResolved = true;
                reject(msg.error);
              }
            } else {
              // Debug: Log when we receive duplicate errors
              if (handlerOptions.verbose) {
                handlerOptions.logger.info(`[collectHtmlWorkerContent] Duplicate ERROR message received for route: ${handlerOptions.route}`);
              }
            }
            break;
        }
      };
      handlerOptions.worker.on("message", messageHandler);
    });

    try {
      // Set up event handler to capture content length
      if (handlerOptions.onEvent) {
        const originalOnEvent = handlerOptions.onEvent;
        handlerOptions.onEvent = (event) => {
          if(handlerOptions.verbose) {
            handlerOptions.logger.info(`[collectHtmlWorkerContent] Event: ${event.type}`);
          }
          if (event.type === "route.error" && !hasError) {
            // Immediately stop the HTML worker when RSC stream encounters an error
            hasError = true;
            
            // Cancel the file write operation
            if (abortController) {
              abortController.abort();
            }
            
            if (handlerOptions.worker) {
              handlerOptions.worker.postMessage({
                type: "CLEANUP",
                id: handlerOptions.route,
              } satisfies CleanupMessage);
            }
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

      // Pipe RSC through transform to HTML
      rscStream.pipe(rscToHtmlStream);

      // Create AbortController for file write cancellation
      abortController = new AbortController();

      // Set up file writing using fileWriter with abort signal
      const writePromise = fileWriter(htmlTransform, "html", handlerOptions, abortController.signal);

      // Wait for route to complete
      await routeComplete;

      // Wait for file writing to complete (only if no error occurred)
      if (!hasError) {
        await writePromise;
      }

      // Ensure streams are properly cleaned up
      rscToHtmlStream.destroy();
      htmlTransform.destroy();

      return { stream: rscStream, metrics };
    } catch (error) {
      // Clean up streams on error
      rscToHtmlStream.destroy();
      if (rscController && typeof rscController.abort === 'function') {
        rscController.abort();
      }
      
      // Cancel file write if it's still in progress
      if (abortController && !abortController.signal.aborted) {
        abortController.abort();
      }
      
      // Ensure htmlTransform is ended to allow fileWriter to complete
      try {
        htmlTransform.end();
      } catch (e) {
        // Ignore end errors
      }
      
      // Wait for fileWriter to complete (it should be cancelled by abort signal)
      if (writePromise) {
        try {
          await writePromise;
        } catch (writeError) {
          // Log write error but don't throw it - the original error is more important
          if (handlerOptions.verbose) {
            handlerOptions.logger.warn(`[collectHtmlWorkerContent] File write error during cleanup: ${writeError}`);
          }
        }
      }
      
      throw error;
    }
  };
