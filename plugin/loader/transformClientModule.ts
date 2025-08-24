import type { ParseResult } from "./directives/types.js";
import { createSourceMap } from "./sourceMap.js";
import type { LoaderConfig, TransformResult } from "./types.js";
import { getNodeEnv } from "../config/getNodeEnv.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { createLogger } from "vite";

/**
 * Transforms a client module by:
 * 1. Removing "use client" directives from the original source
 * 2. Adding registerClientReference calls for all exports
 */
export async function transformClientModule(
  source: string,
  moduleId: string,
  parseResult: ParseResult,
  loader: Pick<
    LoaderConfig,
    "registerClientReferenceName" | "importClientPath" | "moduleID"
  > = DEFAULT_CONFIG.RSC_LOADER[getNodeEnv()],
  verbose = false,
  logger = createLogger(),
  isServerEnvironment = false
): Promise<TransformResult> {
  if (!loader) {
    loader = DEFAULT_CONFIG.RSC_LOADER[getNodeEnv()];
  }
  if (parseResult.type !== "success") {
    return { code: "", map: null };
  }


  if (verbose) {
    logger.info(
      `[transformClientModule] Transforming client module: ${moduleId} (isServerEnvironment: ${isServerEnvironment})`
    );
    logger.info(
      `[transformClientModule] Found exports: ${parseResult.exports.exports.size}`
    );
  }

  // Only transform to registerClientReference calls when running in server environment
  // In client/ssr environments, keep the original code
  if (!isServerEnvironment) {
    if (verbose) {
      logger.info(
        `[transformClientModule] Running in client/ssr environment, keeping original code for: ${moduleId}`
      );
    }
    return { code: source, map: null };
  }

  // For client components in server environment, we completely replace the source
  // with just the registrations - no original implementation should remain

  // Register all exports as client references
  const registrations = [];

  for (const exp of parseResult.exports.exports.values()) {
    // Generate registrations for all exports (functions, classes, and null types from re-transformed files)
    if (exp.type === "function" || exp.type === "class" || exp.type === null) {
      if (verbose) {
        logger.info(
          `[transformClientModule] Found export info: ${exp.localName} for exportName: ${exp.exportName}`
        );
        logger.info(
          `[transformClientModule] moduleId: ${moduleId} (type: ${typeof moduleId})`
        );
      }
      
      // Handle default export specially
      if (exp.exportName === "default") {
        registrations.push(
          `export default ${loader.registerClientReferenceName}(function() { throw new Error("Attempted to call default() on the client"); }, "${moduleId}", "default");`
        );
      } else {
        registrations.push(
          `export const ${exp.exportName} = ${loader.registerClientReferenceName}(function() { throw new Error("Attempted to call ${exp.exportName}() on the client"); }, "${moduleId}", "${exp.exportName}");`
        );
      }
    }
  }

  // Debug: Log all exports found
  if (verbose) {
    logger.info(`[transformClientModule] All exports found: ${JSON.stringify(Array.from(parseResult.exports.exports.values()).map(exp => ({ name: exp.exportName, type: exp.type, localName: exp.localName })))}`);
  }

  // Build final code with ONLY import and registrations - no original source
  let finalCode = "";
  
  // Add registrations if any
  if (registrations.length > 0) {
    const importStatement = `import { ${loader.registerClientReferenceName} } from "${loader.importClientPath}";`;
    finalCode = `${importStatement}\n${registrations.join("\n")}`;
  }



  if (verbose) {
    logger.info(`[transformClientModule] Final code for ${moduleId}:`);
    logger.info(finalCode);
  }

  // Create source map
  const map = createSourceMap(finalCode, source, moduleId);

  return {
    code: finalCode,
    map,
  };
}
