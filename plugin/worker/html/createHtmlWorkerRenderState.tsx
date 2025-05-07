import type { HtmlWorkerRenderState } from "./types.js";
import { PassThrough } from "stream";
import { workerData } from "node:worker_threads";
import type { AllReadyMessage, SerializeableRenderToPipeableStreamOptions } from "../types.js";
import { type ErrorInfo } from "react";
import { createFromNodeStream } from "react-server-dom-esm/client.node";
import { Transform } from "node:stream";
import type { HtmlWorkerOutputMessage } from "../types.js";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { StreamMetrics } from "../../types.js";

// Create require function with project root
const projectRoot = workerData.projectRoot || process.cwd();
const nodeRequire = createRequire(join(projectRoot, "package.json"));

// Import ReactDOM from the project's node_modules
const ReactDOMServer = nodeRequire("react-dom/server");

const createMetrics = (): StreamMetrics => {
  return {
    chunks: 0,
    bytes: 0,
    backpressureCount: 0,
    drainCount: 0,
    errorCount: 0,
    duration: 0,
    startTime: 0,
  };
};
export function createHtmlWorkerRenderState(
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
  sendMessage: (msg: HtmlWorkerOutputMessage) => void,
  rscStream = new PassThrough()
): HtmlWorkerRenderState {
  if (typeof moduleRootPath !== "string") {
    throw new Error("moduleRootPath is required");
  } else if (!moduleRootPath.startsWith(projectRoot)) {
    moduleRootPath = join(projectRoot, moduleRootPath);
  }
  const Shell = createFromNodeStream(rscStream, moduleRootPath, moduleBaseURL);
  const metrics = createMetrics();
  return {
    rscStream: rscStream,
    metrics,
    isReady: false,
    pendingChunks: [],
    htmlTransform: new Transform({
      transform(chunk, encoding, callback) {
        metrics.chunks++;
        metrics.bytes += chunk.length;

        // Send HTML chunks
        sendMessage({
          type: "HTML_CHUNK",
          id: id,
          chunk: chunk,
          encoding,
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
    stream: ReactDOMServer.renderToPipeableStream(Shell, {
      ...pipeableStreamOptions,
      onAllReady: () => {
        rscStream.end();
        sendMessage({
          type: "ALL_READY",
          id,
        } satisfies AllReadyMessage);
      },
      onError: (error: unknown, errorInfo: ErrorInfo) => {
        sendMessage({
          type: "ERROR",
          id,
          error: error instanceof Error ? error : new Error(String(error)),
          errorInfo: errorInfo,
        });
      },
      onShellReady: () => {
        sendMessage({
          type: "SHELL_READY",
          id,
        });
      },
      onShellError: (error: unknown) => {
        sendMessage({
          type: "SHELL_ERROR",
          id,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      },
    }),
  };
}
