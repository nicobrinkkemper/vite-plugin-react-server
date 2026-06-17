/**
 * collectRscContent.ts
 *
 * PURPOSE: Collects RSC content from a stream with metrics.
 *
 * Thin wrapper over the shared `collectStreamContent` helper; the RSC variant
 * uses the configurable `rscTimeout` (default 5s). Returns buffered content and
 * metrics; does NOT write files — that's the caller's responsibility.
 */

import { collectStreamContent } from "./collectStreamContent.js";
import type { CollectRscContentFn } from "./types.js";

/**
 * Collects RSC content from a stream with metrics.
 *
 * @param rsc The stream containing the RSC content
 * @param handlerOptions The options for the handler
 * @returns A promise that resolves with buffered content and metrics
 */
export const collectRscContent: CollectRscContentFn =
  async function _collectRscContent(rsc, handlerOptions) {
    return collectStreamContent(rsc, {
      timeout: handlerOptions.rscTimeout || 5000,
      logTag: "collectRscContent",
      verbose: handlerOptions.verbose,
      logger: handlerOptions.logger,
    });
  };
