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
  const startTime = performance.now()

  const outputPath = join(
    handlerOptions.build.outDir,
    handlerOptions.build.static,
    handlerOptions.route,
    handlerOptions.build.rscOutputPath
  );

  const dir = dirname(outputPath);
  // Ensure directory exists
  await mkdir(join(handlerOptions.projectRoot, dir), { recursive: true });

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

  // Create a promise that resolves when the stream is complete
  const streamComplete = new Promise<void>((resolve, reject) => {
    if (handlerOptions.onEvent) {
      handlerOptions.onEvent({
        type: "file.write",
        data: {
          path: outputPath,
          stream: metricsTransform,
          onComplete: async () => {
            resolve();
          }
        }
      });
    } else {
      resolve();
    }

    metricsTransform.on('error', reject);
  });

  try {
    // Pipe RSC stream through metrics tracking
    rscStream.pipe(metricsTransform);

    // Wait for stream to complete
    await streamComplete;

    return { stream: rscStream, metrics };
  } catch (error) {
    metricsTransform.destroy();
    throw error;
  }
} 