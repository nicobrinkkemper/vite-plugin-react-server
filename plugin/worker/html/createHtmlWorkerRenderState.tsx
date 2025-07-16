import type { HtmlCompleteMessage, HtmlWorkerRenderState } from "./types.js";
import { PassThrough } from "stream";
import { workerData, parentPort } from "node:worker_threads";
import type { SerializeableRenderToPipeableStreamOptions } from "../rsc/types.js";
import { type ErrorInfo } from "react";
import type { HtmlWorkerOutputMessage } from "./types.js";
import { join } from "node:path";
import type { StreamMetrics } from "../../types.js";
import { ReactDOMServer, ReactDOMClient } from "../../vendor/vendor.client.js";
import { toError } from "../../error/toError.js";
import type { ShellErrorMessage } from "../types.js";
import { createLogger, type Logger } from "vite";
import { React } from "../../vendor/vendor.client.js";

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
    verbose = Boolean(workerData.userOptions.verbose),
  }: {
    projectRoot?: string;
    moduleRootPath?: string;
    moduleBaseURL?: string;
    pipeableStreamOptions?: SerializeableRenderToPipeableStreamOptions;
    id?: string;
    verbose?: boolean;
  },
  sendMessage: (msg: HtmlWorkerOutputMessage) => void,
  rscStream = new PassThrough(),
  logger: Logger = createLogger(workerData.resolvedConfig.logLevel ?? "info")
): HtmlWorkerRenderState {
  if (typeof moduleRootPath !== "string") {
    throw new Error("moduleRootPath is required");
  } else if (!moduleRootPath.startsWith(projectRoot)) {
    moduleRootPath = join(projectRoot, moduleRootPath);
  }
  if (!moduleRootPath.endsWith("/")) {
    moduleRootPath = moduleRootPath + "/";
  }
  const Elements = ()=>React.use(ReactDOMClient.createFromNodeStream(
    rscStream,
    moduleRootPath,
    moduleBaseURL,
    {
      callServer: (async (id: string, args: unknown[]) => {
        // Forward server action calls back to the main thread
        sendMessage({
          type: "SERVER_ACTION",
          id,
          args,
        } as HtmlWorkerOutputMessage);
        // Wait for response
        return new Promise((resolve, reject) => {
          const handler = (msg: HtmlWorkerOutputMessage) => {
            if (msg.type === "SERVER_ACTION_RESPONSE" && msg.id === id) {
              parentPort?.removeListener("message", handler);
              if (msg.error) {
                reject(toError(msg.error));
              } else {
                resolve(msg.result);
              }
            }
          };
          parentPort?.on("message", handler);
        });
      }) as CallServerCallback,
    }
  ));
  const metrics = createMetrics();
  const htmlTransform = new PassThrough();

  htmlTransform.on("data", (chunk) => {
    // Don't send HTML chunks if there's an error
    if (hasError) {
      if (verbose) {
        logger.info(`[html-worker:${id}] Skipping HTML chunk due to error`);
      }
      return;
    }
    
    metrics.chunks++;
    metrics.bytes += chunk.length;
    if (verbose) {
      logger.info(
        `[html-worker:${id}] HTML_CHUNK ${Buffer.from(chunk)
          .toString("utf-8")
          .slice(0, 200)}`
      );
    }
    // Send HTML chunks
    sendMessage({
      type: "HTML_CHUNK",
      id: id,
      chunk: chunk,
      encoding: "buffer",
    } satisfies HtmlWorkerOutputMessage);
  });

  htmlTransform.on("end", () => {
    sendMessage({
      type: "HTML_COMPLETE",
      id,
      success: true,
      metrics: metrics,
    } satisfies HtmlCompleteMessage);
  });
  let hasError = false;
  let stream: any; // Declare stream variable first
  
  

  
  // Create the stream with error handlers that can access the stream variable
  stream = ReactDOMServer.renderToPipeableStream(<Elements />, {
    ...pipeableStreamOptions,
    onAllReady: () => {
      sendMessage({
        type: "ALL_READY",
        id,
      } satisfies HtmlWorkerOutputMessage);
    },
    onError: (error: unknown, errorInfo: ErrorInfo) => {
      if (verbose) {
        logger.info(`[html-worker:${id}] React stream onError called`);
      }
      if (!hasError) {
        hasError = true;
        if (verbose) {
          logger.info(`[html-worker:${id}] Setting hasError=true and aborting stream`);
        }
        // End the HTML transform to stop it from sending more chunks
        try {
          htmlTransform.end();
          if (verbose) {
            logger.info(`[html-worker:${id}] HTML transform ended successfully`);
          }
        } catch (e) {
          if (verbose) {
            logger.info(`[html-worker:${id}] Failed to end HTML transform: ${String(e)}`);
          }
        }
        // Immediately abort the stream to stop it from sending more chunks
        try {
          if (stream) {
            stream.abort('error occurred');
            if (verbose) {
              logger.info(`[html-worker:${id}] Stream aborted successfully`);
            }
          }
        } catch (e) {
          if (verbose) {
            logger.info(`[html-worker:${id}] Failed to abort stream: ${String(e)}`);
          }
          // Ignore abort errors
        }
        // Send ERROR message to main thread
        sendMessage({
          type: "ERROR",
          id,
          error: toError(error),
          errorInfo: errorInfo,
        });
      }
    },
    onShellReady: () => {
      sendMessage({
        type: "SHELL_READY",
        id,
      } satisfies HtmlWorkerOutputMessage);
    },
    onShellError: (error: unknown) => {
      if (!hasError) {
        hasError = true;
        // Send SHELL_ERROR message to main thread for proper logging
        sendMessage({
          type: "SHELL_ERROR",
          id,
          error: toError(error),
        } satisfies ShellErrorMessage);
        // Don't try fallback render here - it's handled at the renderPages level
      }
    },
  });
  stream.pipe(htmlTransform);
  return {
    rscStream: rscStream,
    metrics,
    isReady: false,
    htmlTransform: htmlTransform,
    stream: stream,
    get hasError() {
      return hasError;
    },
    setError() {
      hasError = true;
    },
    currentRoute: id,
  };
}
