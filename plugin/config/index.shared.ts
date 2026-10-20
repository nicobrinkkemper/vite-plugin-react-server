// Condition-neutral surface shared by the public ./config subpath under BOTH
// conditions. Only modules that are import-safe under react-server AND
// react-client belong here — re-exporting a *.server or *.client impl would
// defeat the conditional exports and risk the cross-condition linking crash. The
// per-condition `createHandlerOptions` binding lives in index.{server,client}.ts.

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
