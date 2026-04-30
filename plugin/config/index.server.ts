// Server-side aggregator for the public ./config subpath under react-server condition.
//
// IMPORTANT: This file must only re-export modules that are safe under the
// react-server condition. Re-exporting *.client.js here would force ESM static
// linking to evaluate that module's transitive deps (e.g. vendor.client.js,
// which calls projectRequire("react-dom/server")), and that throws under
// --conditions react-server. See bd-6pi.

// Condition-neutral utilities (safe under both conditions).
export * from './autoDiscover/index.js';
export * from './flightBindings.js';
export * from './interpolatePattern.js';
export * from './resolvePages.js';
export * from './resolveUserConfig.js';
export * from './createModuleID.js';
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
 * Server-side handler options creation (RSC).
 *
 * Under react-server condition, `createHandlerOptions` is the .server
 * implementation. To explicitly access the client implementation regardless
 * of current condition, use the `./config/createHandlerOptions` subpath.
 *
 * Note: PR #29 introduced a runtime dispatch in the old neutral
 * `config/index.ts` that statically imported BOTH .server and .client impls.
 * That re-introduced the cross-mixing bd-6pi cleans up. Conditional package
 * exports give external consumers the same auto-select behavior without
 * forcing both impls into a single neutral aggregator.
 */
export { createHandlerOptions } from "./createHandlerOptions.server.js";
export { createHandlerOptions as createHandlerOptionsServer } from "./createHandlerOptions.server.js";

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
