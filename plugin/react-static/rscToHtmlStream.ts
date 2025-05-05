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
import type { HtmlWorkerOutputMessage, RscChunkInputMessage } from "../worker/types.js";
import type { CreateHandlerOptions } from "../types.js";

export type RscToHtmlOptions = Pick<
  CreateHandlerOptions,
  | "worker"
  | "route"
  | "moduleRootPath"
  | "moduleBaseURL"
  | "htmlOutputPath"
  | "pipeableStreamOptions"
  | "build"
  | "rscOutputPath"
  | "cssFiles"
  | "rscOutputPath"
  | "projectRoot"
>;

/**
 * Creates a transform stream that converts RSC content to HTML via worker
 *
 * @param options The options for RSC to HTML transformation
 * @returns A transform stream that outputs HTML content
 */
export function createRscToHtmlStream(options: RscToHtmlOptions): Transform {
  const { worker } = options;
  let sequence = 0;
  const stream = new Transform({
    transform(chunk, _encoding, callback) {
      try {
        // Check if this is a worker message or RSC chunk
        if (typeof chunk === "object" && "type" in chunk) {
          // Handle worker message
          const msg = chunk as HtmlWorkerOutputMessage;

          // Only log errors
          if (msg.type === "ERROR") {
            console.error(
              `[html-worker-output] Error for ${msg.id}: ${msg.error}`
            );
          }
          switch (msg.type) {
            case "HTML_CHUNK":
              if (msg.chunk) {
                this.push(msg.chunk);
              }
              break;
            case "HTML_COMPLETE":
              this.end();
              worker.postMessage({
                type: "CLEANUP",
                id: msg.id,
              });
              break;
            case "SHELL_READY":
              break;
            case "CHUNK_PROCESSED":
              break;
            case "ERROR":
              const error = typeof msg.error === "string" ? new Error(msg.error) : msg.error; 
              this.emit("error", error);
              callback(error);
              return;
            case "CLEANUP_COMPLETE":
              if (!this.writableEnded) {
                this.end();
              }
              break;
            default:
              // Other message types are not logged
              break;
          }
          callback();
        } else {
          // Handle RSC chunk
          worker.postMessage({
            type: "RSC_CHUNK",
            id: options.route,
            chunk,
            sequence: sequence++
          } satisfies RscChunkInputMessage);
          callback();
        }
      } catch (error) {
        callback(error as Error);
      }
    },
    flush(callback) {
      try {
        worker.postMessage({
          type: "RSC_END",
          id: options.route,
        });
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
    rscOutputPath: options.rscOutputPath,
    htmlOutputPath: options.htmlOutputPath,
    cssFiles: options.cssFiles,
    pipeableStreamOptions: options.pipeableStreamOptions,
    projectRoot: options.projectRoot,
  });

  return stream;
}
