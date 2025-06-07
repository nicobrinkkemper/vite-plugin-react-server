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
import type { CreateHandlerOptions } from "../types.js";
import type { Worker } from "node:worker_threads";
import type { ViteDevServer } from "vite";
import type { RouteReadyMessage, RscChunkMessage, RscEndMessage } from "../worker/types.js";

export type RscToHtmlOptions = Pick<
  CreateHandlerOptions,
  | "worker"
  | "route"
  | "moduleRootPath"
  | "moduleBaseURL"
  | "pipeableStreamOptions"
  | "build"
  | "cssFiles"
  | "projectRoot"
>;

/**
 * Creates a transform stream that converts RSC content to HTML via worker
 *
 * @param options The options for RSC to HTML transformation
 * @returns A transform stream that outputs HTML content
 */
export function createRscToHtmlStream(options: RscToHtmlOptions): Transform {
  const worker = options.worker as Worker | ViteDevServer;
  if (!("postMessage" in worker)) {
    throw new Error("Worker is not a valid worker");
  }
  let sequence = 0;
  const stream = new Transform({
    transform(chunk, _encoding, callback) {
      try {
        worker.postMessage({
          type: "RSC_CHUNK",
          id: options.route,
          chunk,
          sequence: sequence++,
        } satisfies RscChunkMessage);
        callback();
      } catch (error) {
        callback(error as Error);
      }
    },
    flush(callback) {
      try {
        worker.postMessage({
          type: "RSC_END",
          id: options.route,
        } satisfies RscEndMessage);
        callback();
      } catch (error) {
        callback(error as Error);
      }
    },
  });

  // Signal ready to receive HTML
  worker.postMessage({
    type: "ROUTE_READY",
    id: options.route,
    // replace server with client
    moduleRootPath: options.moduleRootPath,
    moduleBaseURL: options.moduleBaseURL,
    cssFiles: options.cssFiles,
    pipeableStreamOptions: options.pipeableStreamOptions,
    projectRoot: options.projectRoot,
  } satisfies RouteReadyMessage);

  return stream;
}
