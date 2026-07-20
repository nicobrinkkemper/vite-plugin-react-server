import type { RenderFlightToHtmlFn } from "../stream/renderFlightToHtml.types.js";

/**
 * vprs's own flight -> HTML renderer, behind a lazy import.
 *
 * This module is the ONLY bridge from the edge-handler graph to the runtime
 * renderer (whose vendor layer resolves react-dom through `createRequire`).
 * The Node entry (`/edge`) imports it to keep its zero-config behavior; the web
 * entry (`/edge/web`) must never import it, so a Worker bundle built from that
 * entry contains no Node module resolution at all.
 *
 * Lazy for the same reason the old in-handler import was: react-dom/server is a
 * throwing stub under the `react-server` condition, so the import must not run
 * merely because a handler was constructed — only when a document is rendered.
 */
export const builtInRenderFlightToHtml: RenderFlightToHtmlFn = async (options) =>
  (await import("../stream/renderFlightToHtml.client.js")).renderFlightToHtml(
    options
  );
