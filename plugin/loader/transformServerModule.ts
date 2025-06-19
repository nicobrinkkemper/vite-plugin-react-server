import type { ParseResult, ExportInfo } from "./directives/types.js";
import type { LoaderConfig, ResolvedUserOptions } from "../types.js";
import { createSourceMap } from "./sourceMap.js";
import type { TransformResult } from "./types.js";
import { removeDirectives } from "./removeDirectives.js";
import * as acorn from "acorn";
import { getNodeEnv } from "../getNodeEnv.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";

/**
 * Transforms a server module by:
 * 1. Parsing it to get exports and directives
 * 2. Collecting function-level server directives
 * 3. Registering server functions
 */
export async function transformServerModule(
  source: string,
  moduleId: string,
  parseResult: ParseResult,
  loader: Pick<
    ResolvedUserOptions["loader"],
    "registerServerReferenceName" | "importServerPath" 
  > = DEFAULT_CONFIG.RSC_LOADER[getNodeEnv()],
  verbose = false
): Promise<TransformResult> {
  if (!loader) {
    loader = DEFAULT_CONFIG.RSC_LOADER[getNodeEnv()];
  }
  if (parseResult.type !== "success") {
    return { code: "", map: null };
  }

  // Parse the source with Acorn to get accurate directive locations
  const ast = acorn.parse(source, {
    ecmaVersion: "latest",
    sourceType: "module",
    locations: true,
    ranges: true,
    allowAwaitOutsideFunction: true,
    allowReturnOutsideFunction: true,
  });

  // Collect all directive ranges (file-level and function-level)
  const rangesToRemove: { start: number; end: number }[] = [];

  // File-level: top-level ExpressionStatement with directive
  for (const node of ast.body) {
    if (
      node.type === "ExpressionStatement" &&
      node.directive === "use server"
    ) {
      rangesToRemove.push({ start: node.start, end: node.end });
    }
    // Stop at first non-directive
    if (node.type !== "ExpressionStatement" || !node.directive) break;
  }

  // Function-level: walk all functions and check first statement in body
  function walkFunctionDirectives(node: any) {
    if (
      (node.type === "FunctionDeclaration" ||
        node.type === "FunctionExpression" ||
        node.type === "ArrowFunctionExpression") &&
      node.body &&
      node.body.type === "BlockStatement" &&
      node.body.body.length > 0
    ) {
      const first = node.body.body[0];
      if (
        first.type === "ExpressionStatement" &&
        first.expression.type === "Literal" &&
        first.expression.value === "use server"
      ) {
        rangesToRemove.push({ start: first.start, end: first.end });
      }
    }
    // Recurse into child nodes
    for (const key in node) {
      if (node[key] && typeof node[key] === "object") {
        if (Array.isArray(node[key])) {
          node[key].forEach(walkFunctionDirectives);
        } else {
          walkFunctionDirectives(node[key]);
        }
      }
    }
  }
  walkFunctionDirectives(ast);

  if (verbose) {
    console.log(`[transformServerModule] Ranges to remove:`, rangesToRemove);
  }

  // Remove directives from the source code using the shared utility
  let transformedCode = removeDirectives(source, rangesToRemove);

  // Register all exports as server references
  const registrations = [];
  for (const exp of parseResult.exports.exports.values()) {
    // Check if any exports have server directives
    const hasServerDirective = parseResult.directiveInfo.functionLevel.some(
      (d) => d.type === "server" && d.name === exp.localName
    );
    // Register if it has its own server directive or if there's a file-level directive
    if (
      hasServerDirective ||
      parseResult.directiveInfo.fileLevel?.type === "server"
    ) {
      registrations.push(
        `${loader?.registerServerReferenceName}(${exp.localName}, \"${moduleId}\", "${exp.exportName}");`
      );
    }
  }

  // Only add the import and registrations if there are any registrations to make
  const finalCode =
    registrations.length > 0
      ? `\n      import { ${loader?.registerServerReferenceName} } from "${
          loader?.importServerPath
        }";\n      ${transformedCode}\n      ${registrations.join("\n")}\n    `
      : transformedCode;

  // Create source map based on the final transformed code
  const map = createSourceMap(finalCode, source, moduleId, []);

  return {
    code: finalCode,
    map,
  };
}
