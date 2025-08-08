import type { HandleWorkerRscStreamFn } from "./types.js";
import { getNodeEnv } from "../config/getNodeEnv.js";
import { handleError } from "../error/handleError.js";
import { PassThrough } from "node:stream";
import { stashRscStream, clearStashedRscStream } from "../config/stashedOptionsState.js";
import { setupClientMessageHandlers } from "../helpers/setupClientMessageHandlers.js";
import { createStreamMetrics } from "../metrics/createStreamMetrics.js";

/**
 * Handles the RSC stream from the worker.
 * Creates a ReadableStream that pipes RSC chunks to the response.
 *
 * @param worker - The worker thread
 * @param message - The RSC render message
 * @returns A ReadableStream that yields RSC chunks
 */
export const handleRscStream: HandleWorkerRscStreamFn =
  function _handleWorkerRscStream({
    worker,
    message,
    logger,
    handlers,
    verbose = false,
    panicThreshold = "none",
  }) {
    // Create a ReadableStream from the pipeable stream
    let isClosed = false;

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          if (verbose) logger.info("[react-client] Starting RSC stream");

          // Create a PassThrough stream to handle RSC chunks
          const rscStream = new PassThrough();
          const route = message.route;
          
          // Generate a unique request id to avoid conflicts with concurrent requests
          const requestId = `${route}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
          
          // Stash the RSC stream so message handlers can access it
          stashRscStream(requestId, rscStream);

          // Set up message handlers for the worker
          const cleanup = setupClientMessageHandlers({
            worker,
            logger,
            verbose,
          });

          // Set up stream event handlers
          rscStream.on("data", (chunk: Buffer) => {
            if (!isClosed) {
              controller.enqueue(new Uint8Array(chunk));

                          // Call onMetrics handler if provided
            if (handlers.onMetrics) {
              const metrics = createStreamMetrics({
                chunks: 1,
                bytes: chunk.length,
                startTime: Date.now(),
              });
              handlers.onMetrics(message?.id ?? requestId, metrics);
            }
            }
          });

          rscStream.on("end", () => {
            if (!isClosed) {
              isClosed = true;
              controller.close();
            }

            // Call onEnd handler if provided
            if (handlers.onEnd) {
              handlers.onEnd(message?.id ?? requestId);
            }

            // Clean up
            cleanup();
            clearStashedRscStream(requestId);
          });

          rscStream.on("error", (error) => {
            if (!isClosed) {
              isClosed = true;
              controller.error(error);
            }

            // Clean up
            cleanup();
            clearStashedRscStream(requestId);
          });

          // Send the render message to the worker
          worker.postMessage({
            type: "RSC_RENDER",
            id: requestId,
            route: route,
            url: message.url || "",
            projectRoot: message.projectRoot || "",
            moduleBasePath: message.moduleBasePath || "",
            moduleBaseURL: message.moduleBaseURL || "",
            moduleRootPath: message.moduleRootPath || "",
            cssFiles: message.cssFiles || new Map(),
            globalCss: message.globalCss || new Map(),
            manifest: message.manifest || {},
            serverPipeableStreamOptions: message.serverPipeableStreamOptions || {},
            clientPipeableStreamOptions: message.clientPipeableStreamOptions || {},
            verbose,
            panicThreshold,
            pagePath: message.pagePath,
            propsPath: message.propsPath,
            rootPath: message.rootPath,
            htmlPath: message.htmlPath,
            pageExportName: message.pageExportName,
            propsExportName: message.propsExportName,
            rootExportName: message.rootExportName,
            htmlExportName: message.htmlExportName,
            moduleBase: message.moduleBase,
            publicOrigin: message.publicOrigin,
            rscTimeout: message.rscTimeout,
            htmlTimeout: message.htmlTimeout,
            fileWriteTimeout: message.fileWriteTimeout,
            workerShutdownTimeout: message.workerShutdownTimeout,
            rscWorkerPath: message.rscWorkerPath,
            htmlWorkerPath: message.htmlWorkerPath,
            css: message.css,
            build: message.build,
          });

        } catch (error) {
          const panicError = handleError({
            error: error,
            logger: logger,
            mode: getNodeEnv(),
            panicThreshold: panicThreshold,
            context: "handleWorkerRscStream",
          });

          // If handleError returns an error due to panicThreshold, close the stream immediately
          if (panicError != null) {
            if (!isClosed) {
              isClosed = true;
              controller.error(panicError);
            }
            return;
          }
        }
      },
    });
  };
