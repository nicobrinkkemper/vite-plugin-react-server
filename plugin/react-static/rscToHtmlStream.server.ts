import type { RscToHtmlStreamFn } from "./types.js";
import { createHtmlStream } from "../stream/createHtmlStream.server.js";

export const createRscToHtmlStream: RscToHtmlStreamFn = function _createRscToHtmlStream(
  options
) {
  const {
    id,
    worker,
    htmlWorker,
    route,
    url,
    moduleBasePath,
    moduleBaseURL,
    moduleRootPath,
    projectRoot,
    verbose,
    panicThreshold,
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

  // Use createHtmlStream which works correctly with the HTML worker
  const htmlStream = createHtmlStream({
    id,
    url,
    route,
    rscStream: options.rscStream,
    htmlWorker: htmlWorker || worker,
    logger,
    verbose,
    moduleRootPath,
    moduleBasePath,
    moduleBaseURL,
    projectRoot,
    panicThreshold,
    clientPipeableStreamOptions,
    build,
    onMetrics: options.onMetrics,
    onError: options.onError,
    htmlTimeout: options.htmlTimeout,
  });

  // Handle abort signal
  if (signal) {
    signal.addEventListener("abort", () => {
      if (verbose) {
        logger?.info(`[createRscToHtmlStream:${route}] Abort signal received`);
      }
      htmlStream.abort();
    });
  }

  return htmlStream;
};