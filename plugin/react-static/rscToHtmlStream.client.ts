/**
 * rscToHtmlStream.client.ts
 *
 * PURPOSE: Transforms RSC stream to HTML stream on client side
 * 
 * This follows the client-side pattern where the main thread runs React Client Components:
 * 
 * Client-side pattern: RSC chunks → Main thread HTML conversion (main thread is the HTML worker)
 */
import type { RscToHtmlStreamFn } from "./types.js";
import { createHtmlStream } from "../stream/createHtmlStream.client.js";

export const createRscToHtmlStream: RscToHtmlStreamFn = function _createRscToHtmlStream(
  options
) {
  const {
    route,
    verbose,
    signal,
    logger,
    rscStream,
    // Only pass the props the HTML stream actually needs
    moduleRootPath,
    moduleBasePath,
    moduleBaseURL,
    clientPipeableStreamOptions,
    ...otherOptions
  } = options;

  if (verbose) {
    logger?.info(
      `[createRscToHtmlStream:${route}] Creating RSC to HTML transform stream (client-side, using createHtmlStream)`
    );
  }

  // Use the existing client-side createHtmlStream which handles RSC to HTML conversion
  const htmlStream = createHtmlStream({
    route,
    rscStream,
    logger,
    verbose,
    // Only pass the essential props
    moduleRootPath,
    moduleBasePath,
    moduleBaseURL,
    clientPipeableStreamOptions,
    ...otherOptions,
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