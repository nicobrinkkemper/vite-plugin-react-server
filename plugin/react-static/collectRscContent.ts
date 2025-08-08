/**
 * rscHandler.ts
 *
 * PURPOSE: Handles collecting RSC content from the rscHeadless stream
 *
 * This module:
 * 1. Collects RSC content from the rscHeadless stream
 * 2. Returns the complete RSC content when the stream is done
 * 3. Provides a clean interface for RSC handling
 */

import { Transform } from "node:stream";
import { createStreamMetrics } from "../metrics/createStreamMetrics.js";
import { fileWriter } from "./fileWriter.js";
import type { CollectRscContentFn } from "./types.js";

/**
 * Collects RSC content from the rscHeadless stream
 *
 * @param rscStream The stream containing the RSC content
 * @param handlerOptions The options for the handler
 * @returns A promise that resolves with the complete RSC content and metrics
 */
export const collectRscContent: CollectRscContentFn =
  async function _collectRscContent(rsc, handlerOptions) {
    const metrics = createStreamMetrics();
    const startTime = performance.now();

    // Buffer to store RSC content for reuse
    const rscBuffer: Buffer[] = [];

    // Create transform to track metrics and buffer content
    const metricsTransform = new Transform({
      transform(chunk, _encoding, callback) {
        metrics.chunks++;
        metrics.bytes += chunk.length;
        // Buffer the chunk for reuse
        rscBuffer.push(Buffer.from(chunk));
        callback(null, chunk);
      },
      flush(callback) {
        metrics.duration = performance.now() - startTime;
        if (handlerOptions.verbose) {
          handlerOptions.logger.info(`[collectRscContent] Transform flush: ${metrics.chunks} chunks, ${metrics.duration}ms`);
        }
        callback();
      },
    });

    let writePromise: Promise<void> | undefined;

    try {
      // Set up error handling for route.error events
      if (handlerOptions.onEvent) {
        const originalOnEvent = handlerOptions.onEvent;
        handlerOptions.onEvent = (event) => {
          if (event.type === "route.error") {
            if (handlerOptions.verbose) {
              handlerOptions.logger.info(`[collectRscContent:${handlerOptions.route}] Route error: ${JSON.stringify(event.data.error)}`);
            }
            // Don't abort the stream immediately - let it complete naturally
            // The error will be handled by the error handling logic in the build process
          }
          originalOnEvent(event);
        };
      }

      // Pipe RSC stream through metrics tracking
      rsc.pipe(metricsTransform);

      // Set up file writing using fileWriter
      writePromise = fileWriter(metricsTransform, "rsc", handlerOptions, handlerOptions.signal);

      // Wait for stream to complete with timeout
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (handlerOptions.verbose) {
            handlerOptions.logger.info(`[collectRscContent] Stream timeout reached, forcing completion`);
          }
          resolve();
        }, 3000); // 3 second timeout

        metricsTransform.on("end", () => {
          if (handlerOptions.verbose) {
            handlerOptions.logger.info(`[collectRscContent] Stream ended with ${metrics.bytes} bytes`);
          }
          clearTimeout(timeout);
          resolve();
        });

        metricsTransform.on("error", (error) => {
          if (handlerOptions.verbose) {
            handlerOptions.logger.info(`[collectRscContent] Stream error: ${error}`);
          }
          clearTimeout(timeout);
          reject(error);
        });
      });

      // Wait for file writing to complete
      if (writePromise) await writePromise;

      if (handlerOptions.verbose) {
        handlerOptions.logger.info(`[collectRscContent] File write completed with ${metrics.bytes} bytes`);
      }

      // Return the same interface as collectHtmlWorkerContent for consistency
      // Also include the buffered content for reuse
      return { 
        pipe: rsc.pipe.bind(rsc), 
        abort: rsc.abort.bind(rsc), 
        metrics,
        // Include buffered content for reuse by collectHtmlContent
        bufferedContent: rscBuffer
      };
    } catch (error) {
      if (handlerOptions.verbose) {
        handlerOptions.logger.info(`[collectRscContent] Error: ${error}`);
      }
      metricsTransform.destroy();
      rsc.abort(new Error("RSC Stream aborted"));
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
