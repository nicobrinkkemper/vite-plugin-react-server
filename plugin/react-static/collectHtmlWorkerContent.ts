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

import { PassThrough, Transform } from "node:stream";
import type { CreateHandlerOptions, StreamMetrics } from "../types.js";
import { createStreamMetrics } from "../helpers/metrics.js";
import { createRscToHtmlStream } from "./rscToHtmlStream.js";
import { fileWriter } from "./fileWriter.js";

/**
 * Collects RSC content from the rscFull stream
 *
 * @param rscFull The stream containing the RSC content
 * @returns A promise that resolves with the complete RSC content
 */
export async function collectHtmlWorkerContent(
  rscStream: PassThrough,
  handlerOptions: CreateHandlerOptions
): Promise<{ stream: PassThrough; metrics: StreamMetrics }> {
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
      metrics.duration = Date.now() - startTime;
      callback();
    },
  });

  let isComplete = false;

  // Create a promise that resolves when the route is complete
  const routeComplete = new Promise<void>((resolve, reject) => {
    const messageHandler = (msg: any) => {
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
          // Send cleanup message to worker
          handlerOptions.worker.postMessage({
            type: "CLEANUP",
            id: handlerOptions.route,
          });
          break;
        case "CLEANUP_COMPLETE":
          resolve();
          break;
        case "ERROR":
          handlerOptions.worker.removeListener("message", messageHandler);
          reject(msg.error);
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
        if (event.type === "file.write.done" && event.data.fileType === "html") {
          metrics.bytes = event.data.content.length;
        }
        originalOnEvent(event);
      };
    }

    // Pipe RSC through transform to HTML
    rscStream.pipe(rscToHtmlStream);

    // Set up file writing using fileWriter
    const writePromise = fileWriter(htmlTransform, "html", handlerOptions);

    // Wait for route to complete
    await routeComplete;

    // Wait for file writing to complete
    await writePromise;

    rscToHtmlStream.destroy();

    return { stream: rscStream, metrics };
  } catch (error) {
    // Clean up streams on error
    rscToHtmlStream.destroy();
    throw error;
  }
}
