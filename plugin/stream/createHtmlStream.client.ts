import type { CreateHtmlStreamFn } from "./createHtmlStream.types.js";
import { createWorkerStream } from "./createWorkerStream.js";

export const createHtmlStream: CreateHtmlStreamFn = function _createHtmlStream(
  options
) {
  // HTML = Client-rendered pipeable React (what gets sent to browser)
  // Based on the working collectHtmlWorkerContent pattern
  // This takes an RSC stream and converts it to HTML, just like collectHtmlWorkerContent does
  
  // First, we need an RSC stream to convert to HTML
  // In the working pattern, this comes from the worker
  const worker = createWorkerStream({
    id: options.id,
    route: options.route,
    url: options.url || "",
    projectRoot: options.projectRoot,
    moduleBasePath: options.moduleBasePath,
    moduleBaseURL: options.moduleBaseURL,
    moduleRootPath: options.moduleRootPath,
    cssFiles: options.cssFiles,
    globalCss: options.globalCss,
    manifest: options.manifest,
    clientPipeableStreamOptions: options.clientPipeableStreamOptions,
    verbose: options.verbose,
    panicThreshold: options.panicThreshold,
    logger: options.logger,
    workerPath: options.htmlWorkerPath,
    messageType: "RENDER_HTML",
    currentCondition: "react-client",
    reverseCondition: "react-server",
    worker: options.worker,
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

  return {
    pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => {
      worker.pipe(destination);
      return destination;
    },
    abort: (reason?: unknown) => {
      worker.destroy(new Error(String(reason || "Aborted client-ssr html stream")));
    },
  };
};
