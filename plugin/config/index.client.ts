// Client-side aggregator for the public ./config subpath under the default
// (react-client) condition.
//
// IMPORTANT: This file must only re-export modules that are safe under
// react-client. Re-exporting *.server.js here would statically link the
// .server implementation, which is wrong under react-client and undermines
// the conditional exports map. See bd-6pi.

// Condition-neutral utilities (safe under both conditions).
export * from './autoDiscover/index.js';
export * from './flightBindings.js';
export * from './interpolatePattern.js';
export * from './resolvePages.js';
export * from './resolveUserConfig.js';
export * from './createModuleID.js';
export * from './createRollupLikeHash.js';
export * from './getCondition.js';
export * from './mimeTypes.js';
export * from './resolveDirectiveMatcher.js';
export * from './resolvePatternWithValues.js';
export * from './defaults.js';
export * from './getPaths.js';
export * from './parsePattern.js';
export * from './resolveEnv.js';
export * from './resolveRegExp.js';
export * from './extMap.js';
export * from './resolveAllowedDirectives.js';
export * from './resolveOptions.js';
export * from './resolveUrlOption.js';
export * from './getNodeEnv.js';
export { resolveOptions } from "./resolveOptions.js";
export { resolveBuildPages } from "./autoDiscover/resolveBuildPages.js";
export { resolveAutoDiscover } from "./autoDiscover/resolveAutoDiscover.js";

/**
 * Client-side handler options creation (HTML generation).
 *
 * Under the default (react-client) condition, `createHandlerOptions` is the
 * .client implementation. To explicitly access the server implementation,
 * use the `./config/createHandlerOptions` subpath under react-server.
 */
export { createHandlerOptions } from "./createHandlerOptions.client.js";
export { createHandlerOptions as createHandlerOptionsClient } from "./createHandlerOptions.client.js";

// Types for handler options
export type {
  CreateHandlerOptionsParams,
  CreateHandlerOptionsServerFn,
  CreateHandlerOptionsClientFn,
  ResolvedDefaults,
} from "./createHandlerOptions.types.js";

// Re-export CreateHandlerOptions type from main types file
export type { CreateHandlerOptions } from "../types.js";

// State management
export { getStashedUserOptions, getStashedHandlerOptions, stashHandlerOptions } from "./stashedOptionsState.js";
export { getEnvironmentId } from "./stashedOptionsState.js";

// Utilities
export { getNodeEnv } from "./getNodeEnv.js";
export { getCondition } from "./getCondition.js";
export { DEFAULT_CONFIG } from "./defaults.js";
