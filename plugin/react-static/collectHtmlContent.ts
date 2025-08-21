/**
 * collectHtmlContent.client.ts
 *
 * PURPOSE: Collects HTML stream with metrics
 *
 * This module:
 * 1. Takes an HTML stream and collects it
 * 2. Tracks metrics (chunks, bytes, duration)
 * 3. Returns buffered content and metrics
 * 4. Does NOT create HTML streams - that's the caller's responsibility
 * 5. Does NOT write files - that's the caller's responsibility
 */

import { Transform } from "node:stream";
import { createStreamMetrics } from "../metrics/createStreamMetrics.js";
import type { CollectHtmlContentFn } from "./types.js";

export const collectHtmlContent: CollectHtmlContentFn =
  async function _collectHtmlContent(html, handlerOptions) {
    const metrics = createStreamMetrics();
    const startTime = performance.now();
    const htmlBuffer: Buffer[] = [];

    if (handlerOptions.verbose) {
      handlerOptions.logger.info(
        `[collectHtmlContent.client] Starting HTML collection for route: ${handlerOptions.route}`
      );
    }

    try {
      // Create a transform stream to collect HTML content and track metrics
      const metricsTransform = new Transform({
        transform(chunk, encoding, callback) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding as BufferEncoding);
          htmlBuffer.push(buffer);
          metrics.chunks++;
          metrics.bytes += buffer.length;
          
          if (handlerOptions.verbose) {
            handlerOptions.logger.info(
              `[collectHtmlContent.client] HTML chunk ${metrics.chunks}, bytes: ${buffer.length}, total: ${metrics.bytes}`
            );
          }
          
          callback(null, chunk);
        },
        flush(callback) {
          metrics.duration = performance.now() - startTime;
          if (handlerOptions.verbose) {
            handlerOptions.logger.info(
              `[collectHtmlContent.client] HTML collection completed: ${metrics.bytes} bytes in ${metrics.duration}ms`
            );
          }
          callback();
        }
      });

      // Create a PassThrough stream to consume the transform
      const { PassThrough } = await import("node:stream");
      const consumer = new PassThrough();
      
      // Pipe HTML stream through metrics tracking to consumer
      html.pipe(metricsTransform).pipe(consumer);

      // Wait for stream to complete with timeout
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (handlerOptions.verbose) {
            handlerOptions.logger.info(
              `[collectHtmlContent.client] Stream timeout reached, forcing completion`
            );
          }
          resolve();
        }, 15000); // 15 second timeout for HTML content collection

        consumer.on("end", () => {
          if (handlerOptions.verbose) {
            handlerOptions.logger.info(
              `[collectHtmlContent.client] Stream ended with ${metrics.bytes} bytes`
            );
          }
          clearTimeout(timeout);
          resolve();
        });

        consumer.on("error", (error) => {
          if (handlerOptions.verbose) {
            handlerOptions.logger.info(
              `[collectHtmlContent.client] Stream error: ${error}`
            );
          }
          clearTimeout(timeout);
          reject(error);
        });
      });

      // Create a readable stream from the buffered content that can be piped multiple times
      const { Readable } = await import("node:stream");
      const readableStream = new Readable({
        read() {
          // Push all buffered content
          for (const chunk of htmlBuffer) {
            this.push(chunk);
          }
          this.push(null); // End the stream
        }
      });

      // Return buffered content and metrics - file writing is caller's responsibility
      return {
        pipe: readableStream.pipe.bind(readableStream),
        abort: (reason?: unknown) => {
          html.abort(reason);
          readableStream.destroy(reason as Error);
        },
        metrics,
        // Include buffered content for reuse
        bufferedContent: htmlBuffer,
      };

    } catch (error) {
      if (handlerOptions.verbose) {
        handlerOptions.logger.info(`[collectHtmlContent.client] Error: ${error}`);
      }
      html.abort(new Error("HTML Stream aborted"));
      if (error != null) {
        throw error;
      }
      throw new Error("Failed to collect HTML content");
    }
  }; 