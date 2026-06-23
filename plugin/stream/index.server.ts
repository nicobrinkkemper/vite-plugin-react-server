// Server aggregator for the public ./stream subpath under react-server. The
// condition-neutral surface lives in index.shared.ts; the per-condition stream
// impls are below.
export * from "./index.shared.js";

// RSC stream handling (in-process)
export * from "./handleRscStream.server.js";
export * from "./createRscStream.server.js";

// RSC -> pipeable stream
export * from "./createRenderToPipeableStreamHandler.server.js";

// RSC -> Web ReadableStream (edge / Web-streams runtimes)
export * from "./renderRscReadableStream.server.js";

// HTML stream creation
export * from "./createHtmlStream.server.js";

// HTML stream creation with inlined flight payload (flash-free dynamic SSR)
export * from "./createHtmlStreamWithInlineFlight.server.js";

// High-level dynamic-route renderer (worker + dual-flight + manifest wiring)
export * from "./createInlineFlightRenderer.server.js";

// Element resolution (in-process compose)
export { resolveStreamElements } from "../helpers/resolveStreamElements.server.js";
