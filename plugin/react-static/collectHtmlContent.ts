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

import type { PipeableStream } from "react-dom/server";
import { createRscToHtmlStream } from "./rscToHtmlStream.js";
import type { CreateHandlerOptions, StreamMetrics } from "../types.js";
import { createStreamMetrics } from "../helpers/metrics.js";

/**
 * Collects RSC content from the rscFull stream
 *
 * @param rscFull The stream containing the RSC content
 * @returns A promise that resolves with the complete RSC content
 */
export function collectHtmlContent(
  rscFull: PipeableStream,
  handlerOptions: Pick<
    CreateHandlerOptions<unknown, React.ComponentType<unknown>>,
    | "worker"
    | "route"
    | "PageComponent"
    | "pageProps"
    | "moduleRootPath"
    | "moduleBaseURL"
    | "htmlOutputPath"
    | "pipeableStreamOptions"
    | "build"
    | "cssFiles"
    | "rscOutputPath"
    | "projectRoot"
  >,
  maxTime: number = 5000
): Promise<{ content: string; metrics: StreamMetrics }> {
  const metrics = createStreamMetrics();
  const startTime = Date.now();

  // Create HTML transform stream
  const htmlStream = createRscToHtmlStream({
    worker: handlerOptions.worker,
    route: handlerOptions.route,
    moduleRootPath: handlerOptions.moduleRootPath,
    moduleBaseURL: handlerOptions.moduleBaseURL,
    htmlOutputPath: handlerOptions.htmlOutputPath,
    pipeableStreamOptions: handlerOptions.pipeableStreamOptions ?? {},
    build: handlerOptions.build,
    cssFiles: handlerOptions.cssFiles,
    rscOutputPath: handlerOptions.rscOutputPath,
    projectRoot: handlerOptions.projectRoot,
  });

  // Pipe RSC to HTML stream first
  rscFull.pipe(htmlStream);
  return new Promise<{ content: string; metrics: StreamMetrics }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(
        new Error(
          `HTML stream completion timed out for route: ${handlerOptions.route} after ${maxTime}ms`
        )
      );
      rscFull.abort();
      htmlStream.destroy();
    }, maxTime);

    const htmlChunks: Buffer[] = [];
    let isComplete = false;

    const messageHandler = (msg: any) => {
      if (isComplete) return; // Ignore messages after completion

      if (
        msg.type === "HTML_CHUNK" &&
        msg.id === handlerOptions.route &&
        msg.chunk
      ) {
        metrics.chunks++;
        metrics.bytes += msg.chunk.length;
        htmlChunks.push(msg.chunk);
      } else if (
        msg.type === "HTML_COMPLETE" &&
        msg.id === handlerOptions.route
      ) {
        isComplete = true;
        clearTimeout(timeout);
        handlerOptions.worker.removeListener("message", messageHandler);
        const htmlContent = Buffer.concat(htmlChunks).toString("utf-8");
        metrics.duration = Date.now() - startTime;
        resolve({ content: htmlContent, metrics });
      } else if (msg.type === "ERROR" && msg.id === handlerOptions.route) {
        isComplete = true;
        clearTimeout(timeout);
        handlerOptions.worker.removeListener("message", messageHandler);
        if(msg.errorInfo && msg.errorInfo){ 
          reject(msg.errorInfo);
        } else if (typeof msg.error === "string") {
          reject(new Error(msg.error));
        } else {
          reject(msg.error);
        }
      }
    };

    handlerOptions.worker.on("message", messageHandler);

    // Handle stream errors
    htmlStream.on("error", (error) => {
      if (!isComplete) {
        isComplete = true;
        clearTimeout(timeout);
        handlerOptions.worker.removeListener("message", messageHandler);
        reject(error);
      }
    });
  });
}
