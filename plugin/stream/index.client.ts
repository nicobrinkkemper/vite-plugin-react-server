// Client aggregator for the public ./stream subpath under the default condition.
// The condition-neutral surface lives in index.shared.ts; the per-condition
// stream impls are below.
export * from "./index.shared.js";

// RSC stream handling (worker)
export * from "./handleRscStream.client.js";
export * from "./createRscStream.client.js";

// HTML stream handling
export * from "./createRenderToPipeableStreamHandler.client.js";

// Node stream handling (RSC flight -> React elements)
export * from "./createFromNodeStream.client.js";

// Web-stream handling (RSC flight ReadableStream / Response -> React elements).
// Consumer mirror of renderRscReadableStream (the edge producer): the half a
// client-first / Web-runtime user decodes Flight with.
export * from "./createFromReadableStream.client.js";

// Single-isolate flash-free HTML: decode a Flight ReadableStream and render it
// to an HTML ReadableStream in one process (no worker). The in-process twin of
// plugin/worker/html, for edge / single-isolate builds.
export * from "./renderFlightToHtml.client.js";

// Edge fetch handler: compose the baked flight producer + renderFlightToHtml
// into a Web `(Request) => Response` handler for edge runtimes.
export * from "./createEdgeHandler.client.js";
export type {
  CreateEdgeHandlerOptions,
  CreateEdgeHandlerFn,
  EdgeFetchHandler,
} from "./createEdgeHandler.types.js";

// HTML stream creation
export * from "./createHtmlStream.client.js";

// High-level dynamic-route renderer (clear "run under --conditions react-server" error)
export * from "./createInlineFlightRenderer.client.js";

// Element resolution (decode flight)
export { resolveStreamElements } from "../helpers/resolveStreamElements.client.js";
