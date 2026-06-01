import type { ParseResult } from "react-server-loader/directives";
import { createSourceMap } from "./sourceMap.js";
import type { LoaderConfig, TransformResult } from "./types.js";
import { getNodeEnv } from "../config/getNodeEnv.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";

/**
 * Transforms a client module by:
 * 1. Removing "use client" directives from the original source
 * 2. Adding registerClientReference calls for all exports
 */
export async function transformClientModule(
  source: string,
  moduleId: string,
  transformedModuleId: string,
  parseResult: ParseResult,
  loader: Pick<
    LoaderConfig,
    "registerClientReferenceName" | "importClientPath" | "moduleID" | "verbose" | "logger"
  > = DEFAULT_CONFIG.RSC_LOADER[getNodeEnv()],
): Promise<TransformResult> {
  if (!loader) {
    loader = DEFAULT_CONFIG.RSC_LOADER[getNodeEnv()];
  }
  if (parseResult.type !== "success") {
    return { code: "", map: null };
  }

  if (loader.verbose) {
    loader.logger?.info(
      `[transformClientModule] Transforming client module: ${moduleId} -> ${transformedModuleId}`
    );
    loader.logger?.info(
      `[transformClientModule] Found exports: ${parseResult.exports.exports.size}`
    );
  }

  // For client components in server environment, we completely replace the source
  // with just the registrations - no original implementation should remain

  if (loader.verbose) {
    loader.logger?.info(
      `[transformClientModule] moduleID function called: ${moduleId} -> ${transformedModuleId}`
    );
  }

  if (loader.verbose) {
    loader.logger?.info(`[transformClientModule] Original moduleId: ${moduleId}`);
    loader.logger?.info(
      `[transformClientModule] Registration moduleId: ${transformedModuleId}`
    );
  }

  // Register all exports as client references
  const registrations = [];

  for (const exp of parseResult.exports.exports.values()) {
    // Generate registrations for all exports (functions, classes, and null types from re-transformed files)
    if (exp.type === "function" || exp.type === "class" || exp.type === null) {
      if (loader.verbose) {
        loader.logger?.info(
          `[transformClientModule] Found export info: ${exp.localName} for exportName: ${exp.exportName}`
        );
        loader.logger?.info(
          `[transformClientModule] Using registration moduleId: ${transformedModuleId}`
        );
      }

      // Handle default export specially
      if (exp.exportName === "default") {
        registrations.push(
          `export default ${loader.registerClientReferenceName}(function() { throw new Error("Attempted to call default() on the client"); }, "${transformedModuleId}", "default");`
        );
      } else {
        registrations.push(
          `export const ${exp.exportName} = ${loader.registerClientReferenceName}(function() { throw new Error("Attempted to call ${exp.exportName}() on the client"); }, "${transformedModuleId}", "${exp.exportName}");`
        );
      }
    }
  }

  // Debug: Log all exports found
  if (loader.verbose) {
    loader.logger?.info(
      `[transformClientModule] All exports found: ${JSON.stringify(
        Array.from(parseResult.exports.exports.values()).map((exp) => ({
          name: exp.exportName,
          type: exp.type,
          localName: exp.localName,
        }))
      )}`
    );
  }

  // Build final code with ONLY import and registrations - no original source
  let finalCode = "";

  // Add registrations if any
  if (registrations.length > 0) {
    const importStatement = `import { ${loader.registerClientReferenceName} } from "${loader.importClientPath}";`;
    finalCode = `${importStatement}\n${registrations.join("\n")}`;
  } else {
    // For client files without exports (like entry points), return empty code
    // This prevents client-side code from being included in server bundles
    finalCode = "throw new Error('Client entry point was called from the server, but it is not available in server environment');";
  }

  if (loader.verbose) {
    loader.logger?.info(
      `[transformClientModule] Final code for ${transformedModuleId}:`
    );
    loader.logger?.info(finalCode);
  }

  // Create source map
  const map = createSourceMap(finalCode, source, transformedModuleId);

  return {
    code: finalCode,
    map,
  };
}
