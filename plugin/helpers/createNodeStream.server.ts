import type { CreateNodeStreamOptions } from "./createNodeStream.types.js";
import { ReactDOMServer } from "../vendor/vendor.server.js";

/**
 * Server version of createNodeStream.
 * 
 * Strategy: In server environment, we convert React elements to RSC streams
 * using ReactDOMServer.unstable_prerenderToNodeStream.
 */
export function createNodeStream(options: CreateNodeStreamOptions) {
  const { element, moduleBasePath, logger } = options;

  if (!element) {
    throw new Error("[createNodeStream.server] element is required for server version");
  }

  if (logger?.info) {
    logger.info(`[createNodeStream.server] Converting React element to RSC stream`);
  }

  // Convert React element to RSC stream using ReactDOMServer.unstable_prerenderToNodeStream
  const rscStream = ReactDOMServer.unstable_prerenderToNodeStream(element, moduleBasePath);

  return {
    type: "server" as const,
    elements: rscStream, // Return the RSC stream
  };
} 