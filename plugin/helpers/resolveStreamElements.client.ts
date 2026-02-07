import type { ResolveStreamElementsOptions } from "./resolveStreamElements.types.js";
import { PassThrough } from "node:stream";
import {
  getStashedRscStream,
  stashRscStream,
} from "../config/stashedOptionsState.js";
import { assertNonReactServer } from "../config/getCondition.js";
import { createFromNodeStream } from "../stream/createFromNodeStream.client.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";

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
export async function resolveStreamElements(
  options: ResolveStreamElementsOptions
) {
  const { id, route, moduleBaseURL, moduleRootPath, moduleBasePath, logger } =
    options;
  // Get or create a PassThrough stream for this route
  let rscStream = getStashedRscStream(id);

  if (!rscStream) {
    // Create a new PassThrough stream for this route
    rscStream = new PassThrough();
    stashRscStream(id, rscStream);

    if (logger?.info) {
      logger.info(
        `[resolveStreamElements.client] Created new RSC stream for route: ${route}`
      );
    }
  }

  // Convert RSC stream to React elements using ReactDOMClient.createFromNodeStream
  return createFromNodeStream({
    rscStream,
    moduleRootPath: moduleRootPath,
    moduleBasePath: moduleBasePath ?? DEFAULT_CONFIG.MODULE_BASE_PATH,
    moduleBaseURL: moduleBaseURL,
    logger,
  });
}
