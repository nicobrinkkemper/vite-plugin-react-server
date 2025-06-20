import type { ParseResult } from "./directives/types.js";   
import type { ResolvedUserOptions } from "../types.js";
import { createSourceMap } from "./sourceMap.js";
import type { TransformResult } from "./types.js";
import { getNodeEnv } from "../getNodeEnv.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";

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
    ResolvedUserOptions["loader"],
    "registerClientReferenceName" | "importClientPath"
  > = DEFAULT_CONFIG.RSC_LOADER[getNodeEnv()],
  verbose = false
): Promise<TransformResult> {
  if (!loader) {
    loader = DEFAULT_CONFIG.RSC_LOADER[getNodeEnv()];
  }
  if (parseResult.type !== "success") {
    return { code: "", map: null };
  }

  if (verbose) {
    console.log(
      `[transformClientModule] Transforming client module: ${moduleId}`
    );
    console.log("Found exports:", parseResult.exports);
  }

  // Register all exports as client references
  const registrations = [];
  for (const exp of parseResult.exports.exports.values()) {
    if (exp.type === "function" || exp.type === "class") {
      if (verbose) {
        console.log("Found export info:", exp, "for localName:", exp.localName);
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
