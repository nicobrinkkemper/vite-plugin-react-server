import type { CreateNodeStreamOptions } from "./createNodeStream.types.js";
import { React, ReactDOMClient } from "../vendor/vendor.client.js";
import { assertNonReactServer } from "../config/getCondition.js";

assertNonReactServer();

/**
 * Client version of createNodeStream.
 * 
 * Strategy: Convert RSC stream to React elements using ReactDOMClient.createFromNodeStream.
 * This is the main use case for this function in client environments.
 */
export function createNodeStream(options: CreateNodeStreamOptions) {
  const { rscStream, moduleRootPath, moduleBaseURL, logger } = options;

  if (!rscStream) {
    throw new Error("[createNodeStream.client] rscStream is required for client version");
  }

  if (logger?.info) {
    logger.info(`[createNodeStream.client] Converting RSC stream to React elements`);
  }

  // Convert RSC stream to React elements using ReactDOMClient.createFromNodeStream
  // Use the same pattern as other implementations: React.createElement(() => React.use(...))
  const elements = React.createElement(() =>
    React.use(
      ReactDOMClient.createFromNodeStream(
        rscStream,
        moduleRootPath,
        moduleBaseURL
      )
    )
  );

  return {
    type: "client" as const,
    elements,
  };
} 