import { Readable } from "node:stream";

export type WorkerStreamOptions = {
  id?: string;
  route: string;
  url: string;
  projectRoot: string;
  moduleBasePath: string;
  moduleBaseURL: string;
  moduleRootPath: string;
  cssFiles: Map<string, any>;
  globalCss: Map<string, any>;
  manifest: any;
  serverPipeableStreamOptions?: any;
  clientPipeableStreamOptions?: any;
  verbose?: boolean;
  panicThreshold?: "none" | "critical_errors" | "all_errors";
  logger?: any;
  workerPath: string;
  messageType: string;
  currentCondition: "react-server" | "react-client";
  reverseCondition: "react-server" | "react-client";
  worker?: any; // Optional worker - can be null for placeholder streams
  // Add missing page paths
  pagePath?: string;
  propsPath?: string;
  rootPath?: string;
  htmlPath?: string;
  pageExportName?: string;
  propsExportName?: string;
  rootExportName?: string;
  htmlExportName?: string;
  moduleBase?: string;
  publicOrigin?: string;
  rscTimeout?: number;
  htmlTimeout?: number;
  fileWriteTimeout?: number;
  workerShutdownTimeout?: number;
  rscWorkerPath?: string;
  htmlWorkerPath?: string;
  css?: any;
  build?: any;
  // Component overrides
  HtmlComponent?: any;
  RootComponent?: any;
};

/**
 * Creates a stream that uses the provided worker
 */
export function createWorkerStream(options: WorkerStreamOptions) {
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

  // Send the render message with all required fields
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
    // Add component overrides to ensure they reach the worker
    HtmlComponent: options.HtmlComponent,
    RootComponent: options.RootComponent,
  });

  return readable;
}
