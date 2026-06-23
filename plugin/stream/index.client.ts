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

// HTML stream creation
export * from "./createHtmlStream.client.js";

// High-level dynamic-route renderer (clear "run under --conditions react-server" error)
export * from "./createInlineFlightRenderer.client.js";

// Element resolution (decode flight)
export { resolveStreamElements } from "../helpers/resolveStreamElements.client.js";
