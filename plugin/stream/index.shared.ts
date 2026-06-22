// Condition-neutral surface shared by the public ./stream barrel under BOTH
// conditions. The per-condition stream impls (handleRscStream, createRscStream,
// createRenderToPipeableStreamHandler, createHtmlStream, createInlineFlightRenderer,
// resolveStreamElements) and the condition-only ones
// (createHtmlStreamWithInlineFlight — server; createFromNodeStream — client) live
// in index.{server,client}.ts.

// Worker Stream handling - using unified API
export * from "./createRscWorkerStream.js";

// Shared type exports
export type { CreateRenderToPipeableStreamHandlerFn } from "./createRenderToPipeableStreamHandler.types.js";
export type {
  CreateRscStreamFn,
  CreateRscStreamFnUnified,
  CreateRscStreamOptions,
  ClientRscStreamOptions,
  ServerRscStreamOptions,
  RscStreamResult,
  ClientRscStreamResult,
  ServerRscStreamResult,
  BaseRscStreamResult,
} from "./createRscStream.types.js";
export type { HandleRscStreamFn } from "./handleRscStream.types.js";

// RSC Stream utilities
export {
  validateRscStreamOptions,
  createBaseRscStreamResult,
  handleRscStreamError,
  createRscStreamMetrics,
  setupRscStreamEventHandlers,
} from "./createRscStream.utils.js";

// Shared utilities
export { pipeToResponse } from "../helpers/pipeToResponse.js";
export type { ResolveStreamElementsOptions } from "../helpers/resolveStreamElements.types.js";
