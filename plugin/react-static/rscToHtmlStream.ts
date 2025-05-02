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
import type { WorkerMessage } from "./workerMessageHandler.js";
import type { RscChunkInputMessage } from "../worker/types.js";
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
  const stream = new Transform({
    transform(chunk, _encoding, callback) {
      try {
        // Check if this is a worker message or RSC chunk
        if (typeof chunk === "object" && "type" in chunk) {
          // Handle worker message
          const msg = chunk as WorkerMessage;

          // Only log errors
          if (msg.type === "ERROR") {
            console.error(
              `[html-worker-output] Error for ${msg.id}: ${msg.error}`
            );
          }
          switch (msg.type) {
            case "HTML_CHUNK":
              if (msg.chunk) {
                this.push(Buffer.from(msg.chunk));
              }
              break;
            case "HTML_COMPLETE":
              // Ensure we push any remaining data before ending
              if (msg.html) {
                this.push(Buffer.from(msg.html));
              }
              this.end();
              worker.postMessage({
                type: "CLEANUP",
                id: msg.id,
              });
              break;
            case "CLEANUP_COMPLETE":
              if (!this.writableEnded) {
                this.end();
              }
              break;
            case "ERROR":
              const error = new Error(msg.error);
              this.emit("error", error);
              callback(error);
              return;
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
            // replace server with client
            moduleRootPath: options.moduleRootPath,
            moduleBaseURL: options.moduleBaseURL,
            rscOutputPath: options.rscOutputPath,
            htmlOutputPath: options.htmlOutputPath,
            cssFiles: options.cssFiles,
            pipeableStreamOptions: options.pipeableStreamOptions,
            projectRoot: options.projectRoot,
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
  });

  return stream;
}
