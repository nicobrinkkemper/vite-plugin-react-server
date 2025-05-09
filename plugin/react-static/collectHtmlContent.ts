/**
 * rscHandler.ts
 *
 * PURPOSE: Handles collecting HTML content from the htmlCompact stream
 *
 * This module:
 * 1. Collects HTML content from the rscFull stream
 * 2. Returns the complete HTML content when the stream is done
 * 3. Provides a clean interface for HTML handling
 */

import { PassThrough } from "node:stream";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import type { CreateHandlerOptions, StreamMetrics } from "../types.js";
import { createStreamMetrics } from "../helpers/metrics.js";
import { createRscToHtmlStream } from "./rscToHtmlStream.js";

/**
 * Collects RSC content from the rscFull stream
 *
 * @param rscFull The stream containing the RSC content
 * @returns A promise that resolves with the complete RSC content
 */
export async function collectHtmlContent(
  rscStream: PassThrough,
  handlerOptions: CreateHandlerOptions
): Promise<{ stream: PassThrough; metrics: StreamMetrics }> {
  const htmlStream = new PassThrough();
  const metrics = createStreamMetrics();

  const htmlOutputPath = join(
    handlerOptions.build.outDir,
    handlerOptions.build.static,
    handlerOptions.htmlOutputPath
  );

  // Ensure directory exists
  await mkdir(join(handlerOptions.build.outDir, handlerOptions.build.static), { recursive: true });

  // Create write stream
  const htmlWriteStream = createWriteStream(htmlOutputPath);

  // Create RSC to HTML transform stream
  const rscToHtmlStream = createRscToHtmlStream({
    worker: handlerOptions.worker,
    route: handlerOptions.route,
    moduleRootPath: handlerOptions.moduleRootPath,
    moduleBaseURL: handlerOptions.moduleBaseURL,
    htmlOutputPath: handlerOptions.htmlOutputPath,
    pipeableStreamOptions: handlerOptions.pipeableStreamOptions,
    build: handlerOptions.build,
    cssFiles: handlerOptions.cssFiles,
    rscOutputPath: handlerOptions.rscOutputPath,
    projectRoot: handlerOptions.projectRoot,
  });

  // Create a promise that resolves when the route is complete
  const routeComplete = new Promise<void>((resolve, reject) => {
    const messageHandler = (msg: any) => {
      if (msg.type === "HTML_CHUNK" && msg.id === handlerOptions.route) {
        // Write the HTML chunk to the file
        htmlWriteStream.write(msg.chunk);
      } else if (msg.type === "HTML_COMPLETE" && msg.id === handlerOptions.route) {
        handlerOptions.worker.removeListener("message", messageHandler);
        // Send cleanup message to worker
        handlerOptions.worker.postMessage({ type: "CLEANUP", id: handlerOptions.route });
        resolve();
      } else if (msg.type === "ERROR" && msg.id === handlerOptions.route) {
        handlerOptions.worker.removeListener("message", messageHandler);
        reject(msg.error);
      }
    };
    handlerOptions.worker.on("message", messageHandler);
  });

  try {
    // Pipe RSC through transform to HTML
    rscStream.pipe(rscToHtmlStream).pipe(htmlStream);

    // Wait for route to complete
    await routeComplete;

    // End the write stream and wait for it to finish
    htmlWriteStream.end();
    await new Promise<void>((resolve) => {
      htmlWriteStream.on("finish", resolve);
    });

    htmlStream.destroy();
    rscToHtmlStream.destroy();

    return { stream: htmlStream, metrics };
  } catch (error) {
    // Clean up streams on error
    htmlStream.destroy();
    rscToHtmlStream.destroy();
    htmlWriteStream.destroy();
    throw error;
  }
}
