/**
 * collectHtmlContent.ts
 *
 * PURPOSE: Collects an HTML stream with metrics.
 *
 * Thin wrapper over the shared `collectStreamContent` helper; the HTML variant
 * uses a fixed 15s completion timeout. Does NOT create HTML streams and does
 * NOT write files — that's the caller's responsibility.
 */

import { collectStreamContent } from "./collectStreamContent.js";
import type { CollectHtmlContentFn } from "./types.js";

export const collectHtmlContent: CollectHtmlContentFn =
  async function _collectHtmlContent(html, handlerOptions) {
    return collectStreamContent(html, {
      timeout: 15000,
      logTag: "collectHtmlContent.client",
      verbose: handlerOptions.verbose,
      logger: handlerOptions.logger,
    });
  };
