// Public "./edge/web" entry: the per-request edge server for a Web runtime
// (Cloudflare Workers, Deno Deploy) — same factories as "./edge", minus the
// built-in Node renderer default.
//
// The difference is the module GRAPH, not the behavior: "./edge" can reach
// vprs's runtime flight -> HTML renderer, whose vendor layer resolves react-dom
// through `createRequire` — statically visible to every bundler, so a Worker
// build from that entry drags `node:module` in even when the fallback is never
// called. This entry cannot reach it, which is what lets a webpack-transport
// deploy compose to a bundle with no `node:` at all:
//
// ```js
// import * as bundle from "./dist/server-edge/render.js";
// import { renderFlightToHtml } from "./dist/server-edge/consumer.js";
// import { createEdgeRequestHandler } from "vite-plugin-react-server/edge/web";
//
// export default { fetch: createEdgeRequestHandler(bundle, { renderFlightToHtml }) };
// ```
//
// The price is that `renderFlightToHtml` is REQUIRED here — the baked consumer
// bundle the build emits beside the producer. Checked at creation, not first
// request: a handler that cannot render documents should fail at compose time.
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

function requireRenderer(
  options: CreateEdgeRequestHandlerOptions,
  caller: string
): void {
  if (!options.renderFlightToHtml) {
    throw new Error(
      `[${caller}] \`renderFlightToHtml\` is required on the /edge/web entry: ` +
        `pass the baked consumer bundle's renderer ` +
        `(import { renderFlightToHtml } from "./dist/server-edge/consumer.js"). ` +
        `On Node, 'vite-plugin-react-server/edge' supplies vprs's own instead.`
    );
  }
}

export function createEdgeRequestHandler(
  bundle: EdgeBundleExports,
  options: CreateEdgeRequestHandlerOptions = {}
): EdgeFetchHandler {
  requireRenderer(options, "createEdgeRequestHandler");
  return coreCreateEdgeRequestHandler(bundle, options);
}

export function createEdgeRenderHook(
  bundle: EdgeBundleExports,
  options: CreateEdgeRequestHandlerOptions = {}
): EdgeRenderHook {
  requireRenderer(options, "createEdgeRenderHook");
  return coreCreateEdgeRenderHook(bundle, options);
}

export type {
  CreateEdgeRequestHandlerOptions,
  EdgeBundleExports,
  EdgeRenderHook,
} from "./createEdgeRequestHandler.types.js";
export type { EdgeFetchHandler } from "../stream/createEdgeHandler.types.js";
