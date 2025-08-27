/**
 * Consolidated streaming module for vite-plugin-react-server
 * 
 * This module provides semantic streaming interfaces for React Server Components (RSC) and HTML rendering.
 * 
 * ## Architecture Overview
 * 
 * **Server Environment** (Node.js server):
 * - `createRenderToPipeableStreamHandler.server` → React Elements → RSC Stream
 * - `createRscStream.server` → Route + Components → RSC Stream (direct)
 * 
 * **Client Environment** (Browser/client-side):
 * - `createRenderToPipeableStreamHandler.client` → React Elements → HTML Stream
 * - `createRscStream.client` → Route + Components → RSC Worker → RSC Stream
 * - `createFromNodeStream.client` → RSC Stream → React Elements
 * 
 * **Unified Interface**:
 * - `createRscStream` → Automatic Environment Detection → RSC Stream
 * 
 * ## When to Use Each Function
 * 
 * ### For RSC Streams:
 * - **Unified**: Use `createRscStream` for automatic environment handling
 * - **Server-side**: Use `createRscStream.server` for direct RSC generation
 * - **Client-side**: Use `createRscStream.client` for worker-based RSC generation
 * 
 * ### For HTML Streams:
 * - **Server-side**: Use `createRenderToPipeableStreamHandler.server` + HTML worker
 * - **Client-side**: Use `createRenderToPipeableStreamHandler.client` for direct HTML generation
 * 
 * ## Common Patterns
 * 
 * ```typescript
 * // 1. Unified RSC creation (recommended)
 * const rscStream = await createRscStream({
 *   route: "/about",
 *   pagePath: "/src/pages/about.tsx",
 *   // Environment-specific options are automatically handled
 * });
 * 
 * // 2. Create RSC for file writing (headless)
 * const rscHeadless = await createRscStream({
 *   route: "/about",
 *   pagePath: "/src/pages/about.tsx",
 *   htmlPath: "", // Empty for headless
 * });
 * 
 * // 3. Create RSC for HTML generation (full)
 * const rscFull = await createRscStream({
 *   route: "/about",
 *   pagePath: "/src/pages/about.tsx", 
 *   htmlPath: "/src/pages/about.html.tsx", // HTML wrapper
 * });
 * 
 * // 4. Convert RSC to HTML
 * const htmlStream = createRenderToPipeableStreamHandler({
 *   route: "/about",
 *   rscStream: rscFull.rscStream,
 * });
 * 
 * // 5. Convert RSC stream to React elements
 * const elements = createFromNodeStream({
 *   rscStream: rscStream.rscStream,
 *   moduleBaseURL: "/",
 * });
 * ```
 * 
 * ## Advanced Usage
 * 
 * For advanced use cases, you can import environment-specific functions and types:
 * 
 * ```typescript
 * import { 
 *   createRscStream,
 *   createRscStreamClient,
 *   createRscStreamServer,
 *   type ClientRscStreamOptions,
 *   type ServerRscStreamOptions 
 * } from "./stream";
 * ```
 */

import { getCondition } from "../config/getCondition.js";
import type { CreateHtmlStreamFn } from "./createHtmlStream.types.js";
import type { CreateRscStreamFn } from "./createRscStream.types.js";
import type { HandleRscStreamFn } from "./handleRscStream.types.js";

// Core pipeable stream handlers (the foundation)
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



// RSC Stream utilities
export {
  validateRscStreamOptions,
  createBaseRscStreamResult,
  handleRscStreamError,
  createRscStreamMetrics,
  setupRscStreamEventHandlers,
} from "./createRscStream.utils.js";

// RSC Stream handling
export type { HandleRscStreamFn } from "./handleRscStream.types.js";

// Worker Stream handling - using unified API
export { createRscWorkerStream } from "./createRscWorkerStream.js";
export type { RscWorkerStreamOptions } from "./createRscWorkerStream.js";
export { pipeToResponse } from "../helpers/pipeToResponse.js";

// Stream element resolution
export { resolveStreamElements } from "../helpers/resolveStreamElements.js";
export type { ResolveStreamElementsOptions } from "../helpers/resolveStreamElements.types.js";

const dir = new URL("./", import.meta.url).pathname.replace(/\/$/, ""); 
const condition = getCondition("");

export const {
  handleRscStream,
  createRscStream,
  createHtmlStream,
} = (await import(`${dir}/index.${condition}.js`)) as {
  handleRscStream: HandleRscStreamFn;
  createRscStream: CreateRscStreamFn;
  createHtmlStream: CreateHtmlStreamFn;
}; 