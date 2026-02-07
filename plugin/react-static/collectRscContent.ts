/**
 * collectRscContent.ts
 *
 * PURPOSE: Collects RSC content from a stream with metrics
 *
 * This module:
 * 1. Collects RSC content from the provided stream
 * 2. Tracks metrics (chunks, bytes, duration)
 * 3. Returns buffered content and metrics
 * 4. Does NOT write files - that's the caller's responsibility
 */

import { Transform } from "node:stream";
import { createStreamMetrics } from "../metrics/createStreamMetrics.js";
import type { CollectRscContentFn } from "./types.js";

/**
 * Collects RSC content from a stream with metrics
 *
 * @param rsc The stream containing the RSC content
 * @param handlerOptions The options for the handler
 * @returns A promise that resolves with buffered content and metrics
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
          handlerOptions.logger.info(
            `[collectRscContent] Transform flush: ${metrics.chunks} chunks, ${metrics.duration}ms`
          );
        }
        callback();
      },
    });

    try {
      // Create a PassThrough stream to consume the transform
      const { PassThrough } = await import("node:stream");
      const consumer = new PassThrough();
      
      // Pipe RSC stream through metrics tracking to consumer
      rsc.pipe(metricsTransform).pipe(consumer);

      // Wait for stream to complete with timeout
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (handlerOptions.verbose) {
            handlerOptions.logger.info(
              `[collectRscContent] Stream timeout reached, forcing completion`
            );
          }
          resolve();
        }, handlerOptions.rscTimeout || 5000); // 5 second timeout

        consumer.on("end", () => {
          if (handlerOptions.verbose) {
            handlerOptions.logger.info(
              `[collectRscContent] Stream ended with ${metrics.bytes} bytes`
            );
          }
          clearTimeout(timeout);
          resolve();
        });

        consumer.on("error", (error) => {
          if (handlerOptions.verbose) {
            handlerOptions.logger.info(
              `[collectRscContent] Stream error: ${error}`
            );
          }
          clearTimeout(timeout);
          reject(error);
        });
      });

      if (handlerOptions.verbose) {
        handlerOptions.logger.info(
          `[collectRscContent] Collection completed with ${metrics.bytes} bytes`
        );
      }

      // Create a readable stream from the buffered content that can be piped multiple times
      const { Readable } = await import("node:stream");
      const readableStream = new Readable({
        read() {
          // Push all buffered content
          for (const chunk of rscBuffer) {
            this.push(chunk);
          }
          this.push(null); // End the stream
        }
      });

      // Return buffered content and metrics - file writing is caller's responsibility
      return {
        pipe: readableStream.pipe.bind(readableStream),
        abort: (reason?: unknown) => {
          rsc.abort(reason);
          readableStream.destroy(reason as Error);
        },
        metrics,
        // Include buffered content for reuse
        bufferedContent: rscBuffer,
      };
    } catch (error) {
      if (handlerOptions.verbose) {
        handlerOptions.logger.info(`[collectRscContent] Error: ${error}`);
      }
      metricsTransform.destroy();
      rsc.abort(new Error("RSC Stream aborted"));
      if (error != null) {
        throw error;
      }
      throw new Error("Failed to collect RSC content");
    }
  };
