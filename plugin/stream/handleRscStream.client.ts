import type { HandleRscStreamFn } from "./handleRscStream.types.js";
import { getNodeEnv } from "../config/getNodeEnv.js";
import { handleError } from "../error/handleError.js";
import { PassThrough } from "node:stream";
import {
  stashRscStream,
  clearStashedRscStream,
} from "../config/stashedOptionsState.js";
import { setupClientMessageHandlers } from "../helpers/setupClientMessageHandlers.js";

import { DEFAULT_CONFIG } from "../config/defaults.js";
import { join } from "node:path";

/**
 * Handles the RSC stream from the worker.
 * 
 * Handle = calling createRscStream and handling errors
 * - panicThreshold
 * - verbose logging
 * - calling event handlers
 * - passing the correct options to createRscStream
 *
 * @param worker - The worker thread
 * @param message - The RSC render message
 * @returns A ReadableStream that yields RSC chunks
 */
export const handleRscStream: HandleRscStreamFn<"client"> =
  function _handleWorkerRscStream({
    worker,
    options,
    logger,
    handlers,
    verbose = false,
    panicThreshold = "none",
  }) {
    // Create a ReadableStream from the pipeable stream
    let isClosed = false;

    // Generate a unique request id to avoid conflicts with concurrent requests
    const requestId =
      options.id ??
      `${options.route}-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 11)}`;
    return new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          if (verbose) logger.info("[react-client] Starting RSC stream");

          // Create a PassThrough stream to handle RSC chunks
          const rscStream = new PassThrough();
          const route = options.route;

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
            }
          });

          rscStream.on("end", () => {
            if (!isClosed) {
              isClosed = true;
              controller.close();
            }

            // Call onEnd handler if provided
            if (handlers.onEnd) {
              handlers.onEnd(requestId);
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
            url: options.url || "",
            projectRoot: options.projectRoot || process.cwd(),
            moduleBasePath:
              options.moduleBasePath || DEFAULT_CONFIG.MODULE_BASE_PATH,
            moduleBaseURL:
              options.moduleBaseURL || DEFAULT_CONFIG.MODULE_BASE_URL,
            moduleRootPath:
              options.moduleRootPath ||
              join(
                options.projectRoot,
                options.build.outDir,
                options.build.server,
                options.moduleBasePath === "" ? "/" : ""
              ),
            cssFiles: options.cssFiles || new Map(),
            globalCss: options.globalCss || new Map(),
            manifest: options.manifest || {},
            serverPipeableStreamOptions:
              options.serverPipeableStreamOptions || {},
            clientPipeableStreamOptions:
              options.clientPipeableStreamOptions || {},
            verbose,
            panicThreshold,
            pagePath: options.pagePath,
            propsPath: options.propsPath,
            rootPath: options.rootPath,
            htmlPath: options.htmlPath,
            pageExportName: options.pageExportName,
            propsExportName: options.propsExportName,
            rootExportName: options.rootExportName,
            htmlExportName: options.htmlExportName,
            moduleBase: options.moduleBase,
            publicOrigin: options.publicOrigin,
            rscTimeout: options.rscTimeout,
            htmlTimeout: options.htmlTimeout,
            fileWriteTimeout: options.fileWriteTimeout,
            workerShutdownTimeout: options.workerShutdownTimeout,
            rscWorkerPath: options.rscWorkerPath,
            htmlWorkerPath: options.htmlWorkerPath,
            css: options.css,
            build: options.build,
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
