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

import type { PassThrough } from "node:stream";
import { Transform } from "node:stream";
import type {
  CreateHandlerOptions,
  StreamMetrics,
  PagePropOpt,
  InlineCssOpt,
} from "../types.js";
import { createStreamMetrics } from "../helpers/metrics.js";
import { createRscToHtmlStream } from "./rscToHtmlStream.js";
import { fileWriter } from "./fileWriter.js";
import type { HtmlWorkerOutputMessage } from "../worker/html/types.js";

/**
 * Collects RSC content from the rscFull stream
 *
 * @param rscFull The stream containing the RSC content
 * @returns A promise that resolves with the complete RSC content
 */
export async function collectHtmlWorkerContent<
  T extends PagePropOpt = PagePropOpt,
  InlineCSS extends InlineCssOpt = InlineCssOpt,
  N1 extends string = "Page",
  N2 extends string = "props",
  ID1 extends string = string,
  ID2 extends string | undefined = ID1,
>(
  rscStream: PassThrough,
  handlerOptions: CreateHandlerOptions<T, N1, N2, ID1, ID2, InlineCSS>
): Promise<{ stream: PassThrough; metrics: StreamMetrics }> {
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

  // Create a promise that resolves when the route is complete
  const routeComplete = new Promise<void>((resolve, reject) => {
    if (!handlerOptions.worker) {
      throw new Error("Worker is not a valid worker");
    }
    const messageHandler = (msg: HtmlWorkerOutputMessage) => {
      if (!handlerOptions.worker) {
        throw new Error("Worker is not a valid worker");
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
