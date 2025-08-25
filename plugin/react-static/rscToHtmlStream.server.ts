import { handleError } from "../error/handleError.js";
import type {
  HtmlRenderMessage,
  RscChunkMessage,
  RscEndMessage,
  AbortMessage,
} from "../worker/types.js";
import type { RscToHtmlStreamFn } from "./types.js";
import { createWorkerTransformStream } from "../stream/createWorkerTransformStream.js";

export const createRscToHtmlStream: RscToHtmlStreamFn = function _createRscToHtmlStream(
  options
) {
  const {
    worker,
    route,
    url,
    moduleBasePath,
    moduleBaseURL,
    moduleRootPath,
    projectRoot,
    verbose,
    panicThreshold,
    serverPipeableStreamOptions,
    clientPipeableStreamOptions,
    signal,
    logger,
    build,
  } = options;

  if (!worker) {
    throw new Error("HTML worker is required for RSC to HTML stream");
  }

  if (verbose) {
    logger?.info(
      `[createRscToHtmlStream:${route}] Creating RSC to HTML transform stream`
    );
  }

  const transformStream = createWorkerTransformStream({
    worker: worker,
    route,
    verbose,
    logger,
    // Send proper initialization message that worker expects
    initialMessage: {
      type: "INIT",
      id: route,
      route,
      url,
      moduleBasePath,
      moduleBaseURL,
      moduleRootPath,
      projectRoot,
      verbose,
      panicThreshold,
      // Filter out functions to avoid DataCloneError
      serverPipeableStreamOptions: serverPipeableStreamOptions ? 
        Object.fromEntries(Object.entries(serverPipeableStreamOptions).filter(([_, v]) => typeof v !== 'function')) : undefined,
      clientPipeableStreamOptions: clientPipeableStreamOptions ?
        Object.fromEntries(Object.entries(clientPipeableStreamOptions).filter(([_, v]) => typeof v !== 'function')) : undefined,
      // Pass only the essential build properties that exist
      build: build ? {
        outDir: build.outDir,
        assetsDir: build.assetsDir,
        pages: build.pages,
        static: build.static,
        rscOutputPath: build.rscOutputPath,
        htmlOutputPath: build.htmlOutputPath,
      } : undefined,
    } as HtmlRenderMessage,
    // Transform RSC chunks for worker
    transformInput: (chunk) => ({
      type: "RSC_CHUNK",
      id: route,
      chunk: chunk,
    } as RscChunkMessage),
    // Process HTML chunks from worker
    processOutput: (message) => {
      if (message.type === "HTML_CHUNK") {
        return message.chunk;
      }
      return null;
    },
    // Send RSC_END when flushing
    flushInput: () => ({
      type: "RSC_END",
      id: route,
    } as RscEndMessage),
    // Check for stream end signals
    flushOutput: (message) => {
      return message.type === "HTML_RENDER_END" || message.type === "HTML_COMPLETE";
    },
    // Handle errors with proper panic threshold
    onError: (error, errorInfo) => {
      const panicError = handleError({
        error: error,
        errorInfo: errorInfo,
        logger: logger,
        panicThreshold: panicThreshold,
        context: `HTML worker error for route ${route}`,
      });
      if (panicError != null) {
        transformStream.destroy(panicError);
      }
    },
  });

  // Handle abort signal
  if (signal) {
    const abortHandler = () => {
      const abortMessage: AbortMessage = {
        type: "ABORT",
        id: route,
        reason: signal.reason || "Aborted rsc to html stream",
      };
      worker?.postMessage(abortMessage);
      transformStream.destroy(signal.reason || new Error("Aborted rsc to html stream"));
    };
    signal.addEventListener("abort", abortHandler);
    transformStream.once("close", () => {
      signal.removeEventListener("abort", abortHandler);
    });
  }

  return transformStream;
};