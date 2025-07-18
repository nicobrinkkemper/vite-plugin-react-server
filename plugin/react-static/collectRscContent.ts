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
import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";
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
    const rscStream = rsc.stream;
    const rscController = rsc.controller;
    const metrics = createStreamMetrics();
    const startTime = performance.now();

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
        metrics.duration = performance.now() - startTime;
        callback();
      },
    });

    try {
      // Pipe RSC stream through metrics tracking
      rscStream.pipe(metricsTransform);

      // Set up file writing using fileWriter
      const writePromise = fileWriter(metricsTransform, "rsc", handlerOptions);

      // Wait for stream to complete
      await new Promise<void>((resolve) => {
        metricsTransform.on("end", resolve);
      });

      // Wait for file writing to complete
      await writePromise;

      return { stream: rscStream, controller: rscController, metrics };
    } catch (error) {
      metricsTransform.destroy();
      throw error;
    }
  };
