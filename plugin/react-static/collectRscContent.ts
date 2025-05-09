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

import { PassThrough, Transform } from "node:stream";
import { createWriteStream } from "node:fs";
import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";
import type { CreateHandlerOptions, StreamMetrics } from "../types.js";
import { createStreamMetrics } from "../helpers/metrics.js";

/**
 * Collects RSC content from the rscHeadless stream
 * 
 * @param rscStream The stream containing the RSC content
 * @param handlerOptions The options for the handler
 * @returns A promise that resolves with the complete RSC content and metrics
 */
export async function collectRscContent(
  rscStream: PassThrough,
  handlerOptions: CreateHandlerOptions
): Promise<{ stream: PassThrough; metrics: StreamMetrics }> {
  const metrics = createStreamMetrics();
  const startTime = Date.now();

  const outputPath = join(
    handlerOptions.build.outDir,
    handlerOptions.build.static,
    handlerOptions.rscOutputPath
  );

  const dir = dirname(outputPath);
  // Ensure directory exists
  await mkdir(join(handlerOptions.projectRoot, dir), { recursive: true });

  // Create write stream
  const writeStream = createWriteStream(outputPath);

  // Create transform to track metrics
  const metricsTransform = new Transform({
    transform(chunk, _encoding, callback) {
      metrics.chunks++;
      metrics.bytes += chunk.length;
      callback(null, chunk);
    },
    flush(callback) {
      metrics.duration = Date.now() - startTime;
      callback();
    }
  });

  // Pipe RSC stream to file with metrics tracking
  rscStream.pipe(metricsTransform).pipe(writeStream);

  return { stream: rscStream, metrics };
} 