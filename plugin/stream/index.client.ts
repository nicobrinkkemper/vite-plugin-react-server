// RSC Stream handling
export * from "./handleRscStream.client.js";
export * from "./createRscStream.client.js";

// HTML Stream handling
export * from "./createRenderToPipeableStreamHandler.client.js";

// Node Stream handling
export * from "./createFromNodeStream.client.js";

// HTML Stream creation
export * from "./createHtmlStream.client.js";

// High-level dynamic-route renderer (react-client barrel: clear "use react-server" error)
export * from "./createInlineFlightRenderer.client.js";

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
export { resolveStreamElements } from "../helpers/resolveStreamElements.client.js";
export type { ResolveStreamElementsOptions } from "../helpers/resolveStreamElements.types.js";
