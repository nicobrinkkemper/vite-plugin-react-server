// Public "./edge" entry: the per-request edge server for a vprs build.
//
// Exported WITHOUT a `react-server` condition key, on purpose. The handler runs
// client React (the baked bundle carries server React inside it), but consumers
// import it from code that a react-server-condition build also has to load —
// a `./stream`-style condition split resolves that import to a server barrel
// which does not export it, and the build dies on a module that would never have
// run under that condition anyway. One target for both conditions is what makes
// the import safe from anywhere.
// This entry injects vprs's own renderer as the `renderFlightToHtml` default,
// which is what keeps `createEdgeRequestHandler(bundle)` zero-config on Node.
// That injection is also why this entry's graph reaches the Node vendor layer:
// bundling for a Worker, import "./edge/web" instead (explicit renderer, no
// Node reachability).
import type { EdgeFetchHandler } from "../stream/createEdgeHandler.types.js";
import {
  createEdgeRequestHandler as coreCreateEdgeRequestHandler,
  createEdgeRenderHook as coreCreateEdgeRenderHook,
} from "./createEdgeRequestHandler.js";
import type {
  CreateEdgeRequestHandlerOptions,
  EdgeBundleExports,
  EdgeRenderHook,
} from "./createEdgeRequestHandler.types.js";
import { builtInRenderFlightToHtml } from "./nodeRenderer.js";

export function createEdgeRequestHandler(
  bundle: EdgeBundleExports,
  options: CreateEdgeRequestHandlerOptions = {}
): EdgeFetchHandler {
  return coreCreateEdgeRequestHandler(bundle, {
    ...options,
    renderFlightToHtml:
      options.renderFlightToHtml ?? builtInRenderFlightToHtml,
  });
}

export function createEdgeRenderHook(
  bundle: EdgeBundleExports,
  options: CreateEdgeRequestHandlerOptions = {}
): EdgeRenderHook {
  return coreCreateEdgeRenderHook(bundle, {
    ...options,
    renderFlightToHtml:
      options.renderFlightToHtml ?? builtInRenderFlightToHtml,
  });
}

export type {
  CreateEdgeRequestHandlerOptions,
  EdgeBundleExports,
  EdgeRenderHook,
} from "./createEdgeRequestHandler.types.js";
export type { EdgeFetchHandler } from "../stream/createEdgeHandler.types.js";
