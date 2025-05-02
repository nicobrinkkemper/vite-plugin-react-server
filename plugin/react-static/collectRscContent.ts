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
import type { PipeableStream } from "react-dom/server";
import type { StreamMetrics } from "../types.js";
import { createStreamMetrics } from "../helpers/metrics.js";

/**
 * Collects RSC content from the rscHeadless stream
 * 
 * @param rscHeadless The stream containing the RSC content
 * @returns A promise that resolves with the complete RSC content and metrics
 */
export function collectRscContent(rscHeadless: PipeableStream, route: string, maxTime: number = 1000): Promise<{ content: string; metrics: StreamMetrics }> {
  const metrics = createStreamMetrics();
  const startTime = Date.now();

  return new Promise<{ content: string; metrics: StreamMetrics }>((resolve, reject) => {
    const rscChunks: Buffer[] = [];
    
    const timeout = setTimeout(() => {
      reject(
        new Error(`RSC stream completion timed out for route: ${route}`)
      );
    }, maxTime);

    // Create a transform to collect RSC chunks and metrics
    const rscTransform = new Transform({
      transform(chunk, _encoding, callback) {
        metrics.chunks++;
        metrics.bytes += chunk.length;
        rscChunks.push(chunk);
        callback(null, chunk);
      },
      flush(callback) {
        metrics.duration = Date.now() - startTime;
        const rscContent = Buffer.concat(rscChunks).toString();
        clearTimeout(timeout);
        resolve({ content: rscContent, metrics });
        callback();
      }
    });
    
    // Handle errors
    rscTransform.on("error", (error) => {
      console.error("[RSC] RSC transform error:", error);
      clearTimeout(timeout);
      reject(error);
    });
    
    // Pipe the stream to the RSC transform
    rscHeadless.pipe(rscTransform);
  });
} 