/**
 * # RSC Boundary Handling
 *
 * This file provides the core transformation logic for React Server Components (RSC) boundaries.
 *
 * ## Error Behavior
 *
 * - If a client component is imported on the server, the export is a function that throws a clear error.
 * - If a server action is imported on the client, the export is a function that throws a clear error.
 *
 * This ensures that implementation details are never leaked across boundaries and errors are easy to debug.
 */
import type { ParseResult } from "./directives/types.js";
import { transformServerModule } from "./transformServerModule.js";
import { transformClientModule } from "./transformClientModule.js";
import type { TransformFunction, TransformOptions, TransformResult } from "./types.js";

/**
 * Transforms a module for RSC boundaries, handling imports and registrations.
 */
export const transformModule: TransformFunction = async (
  source: string,
  moduleId: string,
  parseResult: ParseResult,
  options: TransformOptions
): Promise<TransformResult> => {
  if (parseResult.type !== 'success') {
    if(options.verbose) {
      console.log(`[transformModule] Parse error:`, parseResult.error);
    }
    return { code: '', map: null };
  }

  if (options.verbose) {
    console.log(`[transformModule] Module: ${moduleId}`);
    console.log(`[transformModule] Directives:`, parseResult.directiveInfo);
    console.log(
      `[transformModule] isServerFunction:`,
      options.forceServerFunction,
      `isClientComponent:`,
      options.forceClientComponent
    );
  }

  // Only apply transformation for server functions or client components
  if (!(options.forceServerFunction || options.forceClientComponent)) {
    return { code: source, map: null };
  }

  // Transform based on module type and return the result directly
  return options.forceServerFunction
    ? transformServerModule(source, moduleId, parseResult, options.loader, options.verbose)
    : transformClientModule(source, moduleId, parseResult, options.loader, options.verbose);
};
