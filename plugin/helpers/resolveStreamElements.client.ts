import type { ResolveStreamElementsOptions } from "./resolveStreamElements.types.js";
import { ReactDOMClient } from "../vendor/vendor.client.js";
import { PassThrough } from "node:stream";
import { getStashedRscStream, stashRscStream } from "../config/stashedOptionsState.js";
import { assertNonReactServer } from "../config/getCondition.js";

assertNonReactServer();

/**
 * Client version of resolveStreamElements.
 * 
 * Strategy: Get RSC stream from worker and convert to React elements.
 * This involves:
 * 1. Getting or creating a PassThrough stream for the route
 * 2. Converting the RSC stream to React elements using ReactDOMClient.createFromNodeStream
 * 3. Returning the React elements for client-side hydration
 */
export async function resolveStreamElements(options: ResolveStreamElementsOptions) {
  const { route, moduleBaseURL, logger } = options;
  // Get or create a PassThrough stream for this route
  let rscStream = getStashedRscStream(route);
  
  if (!rscStream) {
    // Create a new PassThrough stream for this route
    rscStream = new PassThrough();
    stashRscStream(route, rscStream);
    
    if (logger?.info) {
      logger.info(`[resolveStreamElements.client] Created new RSC stream for route: ${route}`);
    }
  }

  // Convert RSC stream to React elements using ReactDOMClient.createFromNodeStream
  const elements = ReactDOMClient.createFromNodeStream(
    rscStream,
    '',
    moduleBaseURL
  );

  return {
    type: "client" as const,
    elements,
  };
} 