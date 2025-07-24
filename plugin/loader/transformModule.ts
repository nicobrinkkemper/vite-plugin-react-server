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
import type {
  TransformFunction,
  TransformOptions,
  TransformResult,
} from "./types.js";
import { transformNonServerEnvironment } from "./transformNonServerEnvironment.js";
import { createLogger } from "vite";

/**
 * Transforms a module for RSC boundaries, handling imports and registrations.
 */
export const transformModule: TransformFunction = async (
  source: string,
  moduleId: string,
  parseResult: ParseResult,
  {
    forceServerFunction,
    forceClientComponent,
    isServerEnvironment,
    loader,
    verbose,
    logger = createLogger(),
  }: TransformOptions
): Promise<TransformResult> => {
  if (parseResult.type !== "success") {
    if (verbose) {
      logger.error(`[transformModule] Parse error:`, {
        error: parseResult.error,
      });
    }
    return { code: "", map: null };
  }

  if (verbose) {
    logger.info(`[transformModule] Module: ${moduleId}`);
    logger.info(
      `[transformModule] Directives: fileLevel: ${JSON.stringify(parseResult.directiveInfo.fileLevel)}, functionLevel: ${JSON.stringify(parseResult.directiveInfo.functionLevel)}, warnings: ${parseResult.directiveInfo.warnings.length}`
    );
    logger.info(
      `[transformModule] isServerFunction:` +
        (forceServerFunction ? "true" : "false")
    );
    logger.info(
      `[transformModule] isClientComponent:` +
        (forceClientComponent ? "true" : "false")
    );
  }
  if (!isServerEnvironment) {
    // only remove the directives
    return transformNonServerEnvironment(
      source,
      moduleId,
      parseResult,
      loader,
      verbose
    );
  }

  // Only apply transformation for server functions or client components
  if (!(forceServerFunction || forceClientComponent)) {
    return { code: source, map: null };
  }

  // Transform based on module type and return the result directly
  return forceServerFunction
    ? transformServerModule(
        source,
        moduleId,
        parseResult,
        loader,
        verbose,
        logger
      )
    : transformClientModule(
        source,
        moduleId,
        parseResult,
        loader,
        verbose,
        logger
      );
};
