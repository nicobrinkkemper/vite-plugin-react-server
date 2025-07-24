/**
 * rscToHtmlStream.ts
 *
 * PURPOSE: Transforms RSC stream to HTML stream via worker communication
 *
 * This module:
 * 1. Takes RSC stream as input
 * 2. Communicates with worker to transform RSC to HTML
 * 3. Returns a writeable stream of HTML content
 * 4. Handles worker message processing and error cases
 */
import { Transform } from "node:stream";
import type { Worker } from "node:worker_threads";
import type { ViteDevServer } from "vite";
import type { RouteReadyMessage, RscChunkMessage, RscEndMessage } from "../worker/types.js";
import type { RscToHtmlStreamFn } from "./types.js";

/**
 * Creates a transform stream that converts RSC content to HTML via worker
 *
 * @param options The options for RSC to HTML transformation
 * @returns A transform stream that outputs HTML content
 */
export const createRscToHtmlStream: RscToHtmlStreamFn = function _createRscToHtmlStream(options) {
  const worker = options.worker as Worker | ViteDevServer;
  if (!("postMessage" in worker)) {
    throw new Error("Worker is not a valid worker");
  }
  let sequence = 0;
  const stream = new Transform({
    transform(chunk, _encoding, callback) {
      // Check if aborted
      if (options.signal?.aborted) {
        callback(new Error("Stream aborted"));
        return;
      }
      
      worker.postMessage({
        type: "RSC_CHUNK",
        id: options.route,
        chunk,
        sequence: sequence++,
      } satisfies RscChunkMessage);
      if(stream.errored != null) {
        callback(stream.errored);
      } else {
        callback();
      }
    },
    flush(callback) {
      // Check if aborted
      if (options.signal?.aborted) {
        callback(new Error("Stream aborted"));
        return;
      }
      
      worker.postMessage({
        type: "RSC_END",
        id: options.route,
      } satisfies RscEndMessage);
      if(stream.errored != null) {
        callback(stream.errored);
      } else {
        callback();
      }
    },
    writableObjectMode: true,
  });

  // Signal ready to receive HTML
  worker.postMessage({
    type: "ROUTE_READY",
    id: options.route,
    moduleRootPath: options.moduleRootPath,
    moduleBasePath: options.moduleBasePath,
    moduleBaseURL: options.moduleBaseURL,
    projectRoot: options.projectRoot,
    verbose: options.verbose,
    panicThreshold: options.panicThreshold,
    route: options.route,
    cssFiles: options.cssFiles,
    url: options.url,
    pipeableStreamOptions: options.pipeableStreamOptions,
    globalCss: options.globalCss,
  } satisfies RouteReadyMessage);

  // Listen for abort signal and send ABORT message to worker
  if (options.signal) {
    options.signal.addEventListener('abort', () => {
      worker.postMessage({
        type: "ABORT",
        id: options.route,
        reason: options.signal?.reason ?? "Abort signal received",
      });
    });
  }

  return stream;
}
