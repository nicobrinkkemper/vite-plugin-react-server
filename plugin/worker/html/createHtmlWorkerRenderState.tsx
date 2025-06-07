import type { HtmlWorkerRenderState } from "./types.js";
import { PassThrough } from "stream";
import { workerData, parentPort } from "node:worker_threads";
import type { SerializeableRenderToPipeableStreamOptions } from "../rsc/types.js";
import { type ErrorInfo } from "react";
import { Transform } from "node:stream";
import type { HtmlWorkerOutputMessage } from "./types.js";
import { join } from "node:path";
import type { StreamMetrics } from "../../types.js";
import { ReactDOMServer, ReactDOMClient } from "../../vendor/vendor.client.js";

type CallServerCallback = (id: string, args: unknown[]) => Promise<unknown>;

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
    projectRoot = workerData.userOptions.projectRoot,
    moduleRootPath = workerData.userOptions.moduleRootPath,
    moduleBaseURL = workerData.userOptions.moduleBaseURL,
    pipeableStreamOptions = workerData.userOptions.pipeableStreamOptions,
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
  if(!moduleRootPath.endsWith('/')) {
    moduleRootPath = moduleRootPath + '/';
  }
  const elements = ReactDOMClient.createFromNodeStream(rscStream, moduleRootPath, moduleBaseURL, {
    callServer: (async (id: string, args: unknown[]) => {
      // Forward server action calls back to the main thread
      sendMessage({
        type: "SERVER_ACTION",
        id,
        args
      } as HtmlWorkerOutputMessage);
      console.log('[html-worker] callServer', id, args);
      // Wait for response
      return new Promise((resolve, reject) => {
        const handler = (msg: any) => {
          if (msg.type === "SERVER_ACTION_RESPONSE" && msg.id === id) {
            parentPort?.removeListener("message", handler);
            if (msg.error) {
              reject(new Error(msg.error));
            } else {
              resolve(msg.result);
            }
          }
        };
        parentPort?.on("message", handler);
      });
    }) as CallServerCallback
  });
  const metrics = createMetrics();
  const htmlTransform = new Transform({
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
      } satisfies HtmlWorkerOutputMessage);
      callback();
    },
  })
  const stream = ReactDOMServer.renderToPipeableStream(elements, {
    ...pipeableStreamOptions,
    onAllReady: () => {
      rscStream.end();
      sendMessage({
        type: "ALL_READY",
        id,
      } satisfies HtmlWorkerOutputMessage);
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
  });
  stream.pipe(htmlTransform);
  return {
    rscStream: rscStream,
    metrics,
    isReady: false,
    htmlTransform: htmlTransform,
    stream: stream,
  };
}
