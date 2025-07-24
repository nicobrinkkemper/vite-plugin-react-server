import type {
  CallServerCallback,
  CreateHtmlWorkerRenderStateFn,
  HtmlCompleteMessage,
} from "./types.js";
import { PassThrough } from "stream";
import { workerData, parentPort } from "node:worker_threads";
import { type ErrorInfo } from "react";
import type { HtmlWorkerOutputMessage } from "./types.js";
import { join } from "node:path";
import type { StreamMetrics } from "../../types.js";
import { ReactDOMServer, ReactDOMClient } from "../../vendor/vendor.client.js";
import { toError } from "../../error/toError.js";
import type { ShellErrorMessage } from "../types.js";
import { createLogger } from "vite";
import { sendMessage as sendMessageToMainThread } from "../sendMessage.js";
import { handleError } from "../../error/handleError.js";
import { React } from "../../vendor/vendor.client.js";

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

export const createHtmlWorkerRenderState: CreateHtmlWorkerRenderStateFn =
  function _createHtmlWorkerRenderState(
    {
      projectRoot = workerData.userOptions.projectRoot,
      moduleRootPath = workerData.userOptions.moduleRootPath,
      moduleBasePath = workerData.userOptions.moduleBasePath,
      moduleBaseURL = workerData.userOptions.moduleBaseURL,
      pipeableStreamOptions = workerData.userOptions.pipeableStreamOptions,
      id = workerData.id,
      verbose = Boolean(workerData.userOptions.verbose),
      panicThreshold = workerData.userOptions.panicThreshold,
    },
    sendMessage = sendMessageToMainThread,
    rscStream = new PassThrough(),
    logger = createLogger(workerData.resolvedConfig.logLevel ?? "info")
  ) {
    if (typeof moduleRootPath !== "string") {
      throw new Error("moduleRootPath is required");
    } else if (!moduleRootPath.startsWith(projectRoot)) {
      moduleRootPath = join(projectRoot, moduleRootPath);
    }
    if (!moduleRootPath.endsWith(moduleBasePath)) {
      moduleRootPath = moduleRootPath + moduleBasePath;
    }
    if (moduleBasePath === "") {
      moduleRootPath = `${moduleRootPath}/`;
    }
    const Elements = () =>
      React.use(
        ReactDOMClient.createFromNodeStream(
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
        )
      );
    const metrics = createMetrics();
    const htmlTransform = new PassThrough();

    htmlTransform.on("data", (chunk) => {


      metrics.chunks++;
      metrics.bytes += chunk.length;
      if (verbose) {
        logger.info(
          `[html-worker:${id}] HTML_CHUNK (...) ${Buffer.from(
            chunk.slice("<!DOCTYPE html><html>".length, 200)
          )
            .toString("utf-8")
            .slice(0, 200)} (...)`
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

    const sendHtmlComplete = () => {
      // Always send HTML_COMPLETE so the HTML content gets written to the file
      // The error handling happens at the build level, not here
      sendMessage({
        type: "HTML_COMPLETE",
        id,
        success: !hasError,
        metrics: metrics,
      } satisfies HtmlCompleteMessage);
    };

    // Send HTML_COMPLETE when the stream ends, but only if we haven't sent it already
    htmlTransform.on("end", sendHtmlComplete);
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
        if (verbose) {
          logger.info(`[html-worker:${id}] All ready`);
        }

        // Don't send HTML_COMPLETE here - wait for the stream to actually end
        // This ensures all chunks are processed before we signal completion
      },
      onError: (error: unknown, errorInfo: ErrorInfo) => {
        if (hasError) return;
        hasError = true;
        const panicError = handleError({
          error: error,
          errorInfo: errorInfo,
          logger: logger,
          panicThreshold: panicThreshold,
          context: `React stream onError for route ${id}`,
        });
        if (verbose) {
          logger.info(
            `[html-worker:${id}] React stream onError called with error: ${JSON.stringify(
              error
            )} and errorInfo: ${JSON.stringify(errorInfo)}`
          );
        }

        if (panicError == null) {
          sendMessage({
            type: "ERROR",
            id,
            error: error as Error,
            errorInfo: {
              componentStack: errorInfo.componentStack,
              digest: errorInfo.digest,
            },
          } satisfies HtmlWorkerOutputMessage);
        } else {
          sendMessage({
            type: "ERROR",
            id,
            error: panicError,
            errorInfo: {
              componentStack: errorInfo.componentStack,
              digest: errorInfo.digest,
            },
          } satisfies HtmlWorkerOutputMessage);
        }

        if (verbose) {
          logger.info(`[html-worker:${id}] Sent ERROR message to main thread`);
        }
      },
      onShellReady: () => {
        sendMessage({
          type: "SHELL_READY",
          id,
        } satisfies HtmlWorkerOutputMessage);
      },
      onShellError: (error: unknown) => {
        // Send SHELL_ERROR message to main thread for proper logging
        sendMessage({
          type: "SHELL_ERROR",
          id,
          error: error as Error,
        } satisfies ShellErrorMessage);
      },
    });
    stream.pipe(htmlTransform);
    
    // Listen for abort signal to clean up streams
    // AbortSignal is not transferable between worker threads, so we don't need to listen for it here.
    // The stream's abort method will handle cleanup if the main thread sends an abort signal.
    
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
  };
