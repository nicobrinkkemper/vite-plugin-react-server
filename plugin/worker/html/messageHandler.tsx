import { PassThrough } from "node:stream";
import { createLogger } from "vite";
import { workerData } from "node:worker_threads";
import { handleHtmlRender } from "./handleHtmlRender.js";
import type { HtmlWorkerInputMessage } from "./types.js";
import { serializeError } from "../../error/serializeError.js";
import { serializeErrorInfo } from "../../error/serializeErrorInfo.js";
import { DEFAULT_CONFIG } from "../../config/defaults.js";

const logger = createLogger(workerData.resolvedConfig?.logLevel ?? "info");

export async function messageHandler(msg: HtmlWorkerInputMessage) {
  if (msg && msg.type === "INIT") {
    const { id, dataPort, controlPort, options } = msg;
    if(options == null){
      controlPort.postMessage({
        type: "ERROR",
        id,
        error: {
          name: "InvalidOptionsError",
          message: "Invalid options",
        },
      });
      return;
    }
    // Check if both ports are available
    if (!dataPort || !controlPort) {
      return;
    }

    try {
      // Create a PassThrough stream to receive RSC data from the main thread
      const rscStream = new PassThrough();
      let streamStarted = false;

      // Set up the dataPort to receive RSC stream data directly
      dataPort.onmessage = (event: any) => {
        const data = event.data;

        if (data && data.error) {
          // Stream error
          rscStream.destroy(new Error(data.error));
        } else if (data !== null) {
          // RSC chunk data
          if (!streamStarted) {
            streamStarted = true;
            // Start the HTML render process when we receive the first chunk
            handleHtmlRender(
        {
          id,
          route: id,
          rscStream,
          htmlStream: new PassThrough(), // Not used, we handle streaming directly
          projectRoot: options?.projectRoot ?? workerData?.userOptions?.projectRoot ?? process.cwd(),
          moduleRootPath: options?.moduleRootPath ?? workerData?.userOptions?.moduleRootPath,
          moduleBasePath: options?.moduleBasePath ?? workerData?.userOptions?.moduleBasePath ?? DEFAULT_CONFIG.MODULE_BASE_PATH,
          moduleBaseURL: options?.moduleBaseURL ?? workerData?.userOptions?.moduleBaseURL ?? DEFAULT_CONFIG.MODULE_BASE_URL,
          verbose: Boolean(options?.verbose ?? workerData?.userOptions?.verbose),
          htmlTimeout: options?.htmlTimeout ?? workerData?.userOptions?.htmlTimeout ?? DEFAULT_CONFIG.HTML_TIMEOUT,
        },
        {
          onHtmlRender: (id) => {
            controlPort.postMessage({ type: "HTML_RENDER_START", id });
          },
          onError: (id, error, errorInfo) => {
            controlPort.postMessage({
              type: "ERROR",
              id,
              error: serializeError(error),
              errorInfo: serializeErrorInfo(errorInfo),
            });
          },
          onEnd: (id) => {
            controlPort.postMessage({ type: "END", id });
          },
          onShellError: (id, error) => {
            controlPort.postMessage({
              type: "SHELL_ERROR",
              id,
              error: serializeError(error),
            });
          },
          onData: (_id, data) => {
            // Send HTML data via dataPort (raw data, no type wrapper)
            dataPort.postMessage(data);
          },
          onMetrics: (id, metrics) => {
            controlPort.postMessage({ type: "METRICS", id, metrics });
          },
          onHmrAccept: () => {
            // HMR not needed for server-side rendering
          },
          onHmrUpdate: () => {
            // HMR not needed for server-side rendering
          },
          onCleanup: () => {
            // Cleanup - close both ports
            dataPort.close();
            controlPort.close();
          },
        },
        logger
      );
          }
          // RSC chunk data
          rscStream.write(data);
        } else {
          // End of stream
          rscStream.end();
        }
      };
    } catch (error) {
      controlPort.postMessage({
        type: "ERROR",
        id,
        error: {
          name: error instanceof Error ? error.name : "UnknownError",
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
    }
  }
}

