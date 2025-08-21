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
 * Main handler options creation (auto-selects environment)
 * 
 * RECOMMENDED: Use this for most cases - it automatically chooses the right implementation
 * based on your current environment (react-server vs react-client).
 * 
 * Example:
 * ```typescript
 * import { createHandlerOptions } from "../config/index.js";
 * const handlerOptions = await createHandlerOptions("/about", options);
 * ```
 */
export { createHandlerOptions } from "./createHandlerOptions.js";

/**
 * Handler options creation (environment-specific, when you need explicit control)
 * 
 * Use these when you need to explicitly control which implementation to use,
 * regardless of the current environment.
 * 
 * Examples:
 * ```typescript
 * // Force server implementation (for RSC streams)
 * import { createHandlerOptionsServer } from "../config/index.js";
 * const rscOptions = await createHandlerOptionsServer("/about", options);
 * 
 * // Force client implementation (for HTML streams)  
 * import { createHandlerOptionsClient } from "../config/index.js";
 * const htmlOptions = await createHandlerOptionsClient("/about", options);
 * ```
 */
export { createHandlerOptions as createHandlerOptionsServer } from "./createHandlerOptions.server.js";
export { createHandlerOptions as createHandlerOptionsClient } from "./createHandlerOptions.client.js";

// Types for handler options
export type {
  CreateHandlerOptionsParams,
  CreateHandlerOptionsServerFn,
  CreateHandlerOptionsClientFn,
  ResolvedDefaults,
} from "./createHandlerOptions.types.js";

// State management
export { getStashedUserOptions, getStashedHandlerOptions, stashHandlerOptions } from "./stashedOptionsState.js";
export { getEnvironmentId } from "./stashedOptionsState.js";

// Utilities
export { getNodeEnv } from "./getNodeEnv.js";
export { getCondition } from "./getCondition.js";
export { DEFAULT_CONFIG } from "./defaults.js";


