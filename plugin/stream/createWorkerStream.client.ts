import { Readable } from "node:stream";
import type { CreateWorkerStreamFn, ClientWorkerStreamOptions } from "./createWorkerStream.types.js";

/**
 * Creates a worker stream for client-side rendering
 */
export const createWorkerStream: CreateWorkerStreamFn<"client"> = function _createWorkerStreamClient(options: ClientWorkerStreamOptions) {
  // Set up message handling functions first (even if worker is null)
  const messageHandler = (message: any) => {
    // Use the unique ID if provided, otherwise fall back to route
    const expectedId = options.id || options.route;
    if (message.id !== expectedId) {
      return;
    }

    if (message.type === "RSC_CHUNK" || message.type === "HTML_CHUNK") {
      readable.push(message.chunk);
    } else if (message.type === "RSC_END" || message.type === "HTML_COMPLETE") {
      readable.push(null); // End the stream
      if (options.worker) {
        options.worker.off("message", messageHandler);
      }
    } else if (message.type === "ERROR") {
      const error = new Error(message.error?.message || "Worker error");
      error.stack = message.error?.stack;
      readable.destroy(error);
      if (options.worker) {
        options.worker.off("message", messageHandler);
      }
    } else if (message.type === "SHELL_ERROR") {
      const error = new Error(message.error?.message || "Worker shell error");
      error.stack = message.error?.stack;
      readable.destroy(error);
      if (options.worker) {
        options.worker.off("message", messageHandler);
      }
    }
  };

  const errorHandler = (error: Error) => {
    readable.destroy(error);
    if (options.worker) {
      options.worker.off("message", messageHandler);
      options.worker.off("error", errorHandler);
    }
  };

  // Create a readable stream that reads from the worker
  const readable = new Readable({
    read() {
      // This will be called when the stream wants more data
    },
    destroy(error: any, callback: any) {
      // Clean up only the listeners that were set up for this stream
      if (options.worker) {
        options.worker.off("message", messageHandler);
        options.worker.off("error", errorHandler);
      }
      callback(error);
    },
  });

  // If no worker is provided, return a placeholder stream
  if (!options.worker) {
    // Return a placeholder stream that immediately ends
    readable.push(null);
    return readable;
  }

  options.worker.on("message", messageHandler);
  options.worker.on("error", errorHandler);

  // Track when worker is ready
  const workerReadyHandler = (message: any) => {
    if (message.type === "READY") {
      // Worker is ready, call the callback if provided
      if (options.onWorkerReady) {
        options.onWorkerReady();
      }
      // Remove the ready handler after it's called
      options.worker?.off("message", workerReadyHandler);
    }
  };

  // Listen for worker ready message
  options.worker.on("message", workerReadyHandler);

  // Clean the build object to remove functions that can't be serialized
  const cleanBuild = options.build
    ? {
        client: options.build.client,
        outDir: options.build.outDir,
        rscOutputPath: options.build.rscOutputPath,
        htmlOutputPath: options.build.htmlOutputPath,
        server: options.build.server,
        static: options.build.static,
        // Remove functions that can't be serialized
        pages: Array.isArray(options.build.pages) ? options.build.pages : [],
      }
    : undefined;

  // Send the render message with all required fields for client
  options.worker.postMessage({
    type: options.messageType,
    id: options.id || options.route,
    route: options.route,
    url: options.url,

    projectRoot: options.projectRoot,
    moduleBasePath: options.moduleBasePath,
    moduleBaseURL: options.moduleBaseURL,
    moduleRootPath: options.moduleRootPath,
    cssFiles: options.cssFiles,
    globalCss: options.globalCss,
    manifest: options.manifest,
    serverPipeableStreamOptions: options.serverPipeableStreamOptions,
    clientPipeableStreamOptions: options.clientPipeableStreamOptions,
    verbose: options.verbose,
    panicThreshold: options.panicThreshold,
    // Add missing page paths
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
    build: cleanBuild,
  });

  return readable;
};
