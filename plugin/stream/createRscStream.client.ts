import { createRscStreamTwoPort } from "./createRscStreamTwoPort.client.js";

import type { CreateRscStreamFn } from "./createRscStream.types.js";

import { assertNonReactServer } from "../config/getCondition.js";



assertNonReactServer();



/**
 * Creates an RSC stream by communicating with the RSC worker.
 * 
 * **Purpose**: Creates RSC streams by offloading React rendering to a separate worker thread.
 * **When to use**: 
 * - You need to create RSC streams in a client environment
 * - You want to avoid blocking the main thread during React rendering
 * - You're building static sites and need RSC content for multiple routes
 * - You need to create .rsc files for client-side navigation
 * 
 * **Flow**: Route + Components → RSC Worker → RSC Stream
 * 
 * @example
 * ```typescript
 * // Create RSC stream for a route
 * const rscStream = createRscStream({
 *   route: "/about",
 *   pagePath: "/src/pages/about.tsx",
 *   propsPath: "/src/pages/about.props.ts",
 *   logger: myLogger,
 *   worker: rscWorker, // Optional: provide existing worker
 * });
 * 
 * // Pipe to file
 * rscStream.pipe(fileStream);
 * ```
 * 
 * @example
 * ```typescript
 * // Create headless RSC (no HTML wrapper)
 * const rscHeadless = createRscStream({
 *   route: "/about",
 *   pagePath: "/src/pages/about.tsx",
 *   htmlPath: "", // Empty for headless
 * });
 * 
 * // Create full RSC (with HTML wrapper)
 * const rscFull = createRscStream({
 *   route: "/about", 
 *   pagePath: "/src/pages/about.tsx",
 *   htmlPath: "/src/pages/about.html.tsx", // HTML wrapper
 * });
 * ```
 * 
 * @param options - Options for RSC stream creation
 * @returns RSC stream with pipe/abort interface
 */
export const createRscStream: CreateRscStreamFn<"client"> = function _createRscStreamClient(options) {
  // Use the new two-port architecture for client-side RSC streams
  return createRscStreamTwoPort(options);
};