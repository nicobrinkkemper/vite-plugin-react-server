import type { ParseResult } from "./directives/types.js";
import { createSourceMap } from "./sourceMap.js";
import type { LoaderConfig, TransformResult } from "./types.js";
import { removeDirectives } from "./removeDirectives.js";
import * as acorn from "acorn";
import { getNodeEnv } from "../config/getNodeEnv.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";

/**
 * Transforms a server module by:
 * 1. Parsing it to get exports and directives
 * 2. Collecting function-level server directives
 * 3. Registering server functions
 */
export async function transformNonServerEnvironment(
  source: string,
  moduleId: string,
  parseResult: ParseResult,
  loader: Pick<LoaderConfig, "parse"> = DEFAULT_CONFIG.RSC_LOADER[getNodeEnv()],
  verbose = false
): Promise<TransformResult> {
  if (parseResult.type !== "success") {
    return { code: "", map: null };
  }

  // Parse the source with Acorn to get accurate directive locations
  let ast;
  if (loader.parse) {
    const parsed = loader.parse(source);
    if (parsed instanceof Promise) {
      ast = await parsed;
    } else {
      ast = parsed;
    }
  }
  if (typeof ast === "object" && "ast" in ast) {
    ast = ast.ast;
  }
  if (!ast) {
    ast = acorn.parse(source, {
      ecmaVersion: "latest",
      sourceType: "module",
      locations: true,
      ranges: true,
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true,
    });
  }

  // check if body is iterable
  if (!(ast.body && typeof ast.body === "object" && "forEach" in ast.body)) {
    throw new Error(
      `[transformServerModule] Failed to parse ${moduleId} with loader.parse`
    );
  }

  // Collect all directive ranges (file-level and function-level)
  const rangesToRemove: { start: number; end: number }[] = [];

  // File-level: top-level ExpressionStatement with directive
  for (const node of ast.body) {
    if (node.type === "ExpressionStatement") {
      if (node.directive === "use client") {
        // Remove "use client" directives in client environment
        rangesToRemove.push({ start: node.start, end: node.end });
      } else if (node.directive === "use server") {
        // Throw error when "use server" directive is found in client environment
        throw new Error(
          "use server directive found in client module: " + moduleId
        );
      }
    }
    // Stop at first non-directive
    if (node.type !== "ExpressionStatement" || !node.directive) break;
  }

  if (verbose) {
    console.log(
      `[transformNonServerEnvironment] Ranges to remove:`,
      rangesToRemove
    );
  }

  // Remove directives from the source code using the shared utility
  const transformedCode = removeDirectives(source, rangesToRemove);

  // Only add the import and registrations if there are any registrations to make
  const finalCode = transformedCode;
  




  // Create source map based on the final transformed code
  const map = createSourceMap(finalCode, source, moduleId, []);

  return {
    code: finalCode,
    map,
  };
}
