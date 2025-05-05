import type { HtmlWorkerRenderState } from "./types.js";
import { PassThrough } from "stream";
import { workerData } from "node:worker_threads";
import type { SerializeableRenderToPipeableStreamOptions } from "../types.js";
import { type ErrorInfo } from "react";
import { createFromNodeStream } from "react-server-dom-esm/client.node";
import { Transform } from "node:stream";
import type { HtmlWorkerOutputMessage } from "../types.js";
import { createRequire } from "node:module";
import { join } from "node:path";

// Create require function with project root
const projectRoot = workerData.projectRoot || process.cwd();
const nodeRequire = createRequire(join(projectRoot, 'package.json'));

// Import ReactDOM from the project's node_modules
const ReactDOMServer = nodeRequire('react-dom/server');


const createMetrics = () => {
  return {
    totalChunksReceived: 0,
    totalBytesReceived: 0,
    totalChunksProcessed: 0,
    totalBytesProcessed: 0,
  };
};
export function createHtmlWorkerRenderState (
  {
    projectRoot = workerData.projectRoot,
    moduleRootPath = workerData.moduleRootPath,
    moduleBaseURL = workerData.moduleBaseURL,
    pipeableStreamOptions = workerData.pipeableStreamOptions,
    id = workerData.id,
  }: {
    projectRoot?: string;
    moduleRootPath?: string;
    moduleBaseURL?: string;
    pipeableStreamOptions?: SerializeableRenderToPipeableStreamOptions;
    id?: string;
  },
  sendMessage: (msg: any) => void,
  rscStream = new PassThrough(),
  ): HtmlWorkerRenderState {
    const elements = createFromNodeStream(
      rscStream,
      moduleRootPath,
      moduleBaseURL,
    )
    const metrics = createMetrics()
    return {
      rscStream: rscStream,
      metrics,
      isReady: false,
      pendingChunks: [],
      htmlTransform: new Transform({
        transform(chunk, encoding, callback) {
          metrics.totalChunksProcessed++;
          metrics.totalBytesProcessed += chunk.length;

          // Send HTML chunks
          sendMessage({
            type: "HTML_CHUNK",
            id: id,
            chunk: chunk,
          } satisfies HtmlWorkerOutputMessage);
          callback();
        },
        flush(callback) {
          sendMessage({
            type: "HTML_COMPLETE",
            id,
            success: true,
            metrics: metrics,
          });
          callback();
        },
      }),
      stream: ReactDOMServer.renderToPipeableStream(
        elements,
        {
          ...pipeableStreamOptions,
          onAllReady: () => {
            rscStream.end();
            sendMessage({
              type: "ALL_READY",
              id,
              success: true,
            });
          },
          onError: (error: unknown, errorInfo: ErrorInfo) => {
            sendMessage({
              type: "ERROR",
              id,
              error: `Error: ${
                error instanceof Error ? error.message : String(error)
              }`,
              errorInfo: {
                componentStack: errorInfo?.componentStack,
              },
            });
          },
          onShellReady: () => {
            sendMessage({
              type: "SHELL_READY",
              id,
              success: true,
            });
          },
          onShellError: (error: unknown) => {
            sendMessage({
              type: "ERROR",
              id,
              error: error instanceof Error ? error.message : String(error),
            });
          },
        }
      )
    };
  };