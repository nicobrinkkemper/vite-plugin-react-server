import type { ParseResult } from "./directives/types.js";
import { createSourceMap } from "./sourceMap.js";
import type { LoaderConfig, TransformResult } from "./types.js";
import { getNodeEnv } from "../config/getNodeEnv.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { createLogger } from "vite";

/**
 * Transforms a client module by:
 * 1. Removing all original code including imports and directives
 * 2. Registering client components with registerClientReference
 */
export async function transformClientModule(
  source: string,
  moduleId: string,
  parseResult: ParseResult,
  loader: Pick<
    LoaderConfig,
    "registerClientReferenceName" | "importClientPath"
  > = DEFAULT_CONFIG.RSC_LOADER[getNodeEnv()],
  verbose = false,
  logger = createLogger()
): Promise<TransformResult> {
  if (!loader) {
    loader = DEFAULT_CONFIG.RSC_LOADER[getNodeEnv()];
  }
  if (parseResult.type !== "success") {
    return { code: "", map: null };
  }

  if (verbose) {
    logger.info(
      `[transformClientModule] Transforming client module: ${moduleId}`
    );
    logger.info(
      `[transformClientModule] Found exports: ${parseResult.exports.exports.size}`
    );
  }

  // Register all exports as client references
  const registrations = [];
  for (const exp of parseResult.exports.exports.values()) {
    if (exp.type === "function" || exp.type === "class") {
      if (verbose) {
        logger.info(
          `[transformClientModule] Found export info: ${exp.localName} for exportName: ${exp.exportName}`
        );
        logger.info(
          `[transformClientModule] moduleId: ${moduleId} (type: ${typeof moduleId})`
        );
      }
      registrations.push(
        `export const ${exp.exportName} = ${loader.registerClientReferenceName}(function() { throw new Error("Attempted to call ${exp.exportName}() on the client"); }, "${moduleId}", "${exp.exportName}");`
      );
    }
  }

  const finalCode = `
import { ${loader.registerClientReferenceName} } from "${
    loader.importClientPath
  }";
${registrations.join("\n")}
`;

  // Create source map
  const map = createSourceMap(finalCode, source, moduleId);

  return {
    code: finalCode,
    map,
  };
}
