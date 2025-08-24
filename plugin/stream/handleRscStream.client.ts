import type { HandleRscStreamFn } from "./handleRscStream.types.js";
import { PassThrough } from "node:stream";
import {
  stashRscStream,
  clearStashedRscStream,
} from "../config/stashedOptionsState.js";
import { setupClientMessageHandlers } from "../helpers/setupClientMessageHandlers.js";
import { createUnifiedStreamHandler } from "../helpers/createUnifiedStreamHandler.js";

import { DEFAULT_CONFIG } from "../config/defaults.js";
import { join } from "node:path";

/**
 * Client-side RSC stream handler using unified stream management
 * 
 * Handle = calling createRscStream and handling errors
 * - panicThreshold
 * - verbose logging
 * - calling event handlers
 * - passing the correct options to createRscStream
 * - unified stream management with consistent error handling
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
    // Generate a unique request id to avoid conflicts with concurrent requests
    const requestId =
      options.id ??
      `${options.route}-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 11)}`;

         // Determine RSC variant based on HTML component/path
     const hasHtml = (options as any).htmlPath !== "" || (options as any).HtmlComponent;
     const rscVariant = hasHtml ? "rsc-full" : "rsc-headless";

     // Create unified stream handler for consistent management
     const unifiedStream = createUnifiedStreamHandler({
       route: options.route,
       id: requestId,
       streamType: "rsc",
       rscVariant,
       verbose,
       logger,
       panicThreshold,
       timeout: options.rscTimeout || 5000,
       onError: handlers.onError,
       onEnd: handlers.onEnd,
       onCleanup: undefined, // Not available in handlers type
       onEvent: undefined, // Not available in handlers type
     });

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

    // Pipe the RSC stream to the unified stream handler
    rscStream.pipe(unifiedStream.stream as any);

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

    // Convert the unified stream to a ReadableStream
    return new ReadableStream<Uint8Array>({
      start(controller) {
        unifiedStream.stream.on("data", (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });

        unifiedStream.stream.on("end", () => {
          controller.close();
        });

        unifiedStream.stream.on("error", (error) => {
          controller.error(error);
        });

        unifiedStream.stream.on("abort", (reason) => {
          controller.error(new Error(String(reason || "Stream aborted")));
        });
      },
      cancel() {
        unifiedStream.abort();
        cleanup();
        clearStashedRscStream(requestId);
      },
    });
  };
