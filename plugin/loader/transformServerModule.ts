import type { ParseResult, Program } from "./directives/types.js";
import { createSourceMap } from "./sourceMap.js";
import type { LoaderConfig, TransformResult } from "./types.js";
import { removeDirectives } from "./removeDirectives.js";
import * as acorn from "acorn";
import { getNodeEnv } from "../config/getNodeEnv.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import type {
  ArrowFunctionExpression,
  FunctionDeclaration,
  FunctionExpression,
} from "acorn";
import { createLogger } from "vite";

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
    LoaderConfig,
    "registerServerReferenceName" | "importServerPath" | "parse" | "isClientComponentCode" | "isClientComponentByName" | "registerClientReferenceName" | "importClientPath"
  > = DEFAULT_CONFIG.RSC_LOADER[getNodeEnv()],
  verbose = false,
  logger = createLogger(),
): Promise<TransformResult> {
  if (!loader) {
    loader = DEFAULT_CONFIG.RSC_LOADER[getNodeEnv()];
  }
  if (parseResult.type !== "success") {
    return { code: "", map: null };
  }



  // Parse the source using the loader's parse function or fallback to Acorn
  let ast;
  if (typeof loader.parse === "function") {
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
  function walkFunctionDirectives(
    node:
      | FunctionDeclaration
      | FunctionExpression
      | ArrowFunctionExpression
      | Program
  ) {
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
      const value = node[key as keyof typeof node];
      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (item && typeof item === "object" && "type" in item) {
            walkFunctionDirectives(item as any);
          }
        });
      } else if (value && typeof value === "object" && "type" in value) {
        walkFunctionDirectives(value as any);
      }
    }
  }
  walkFunctionDirectives(ast);

  if (verbose) {
    for (const range of rangesToRemove) {
      logger.info(
        `[transformServerModule] Ranges to remove: start: ${range.start}, end: ${range.end}, source: ${source.slice(range.start, range.end)}`
      );
    }
  }

  // Remove directives from the source code using the shared utility
  const transformedCode = removeDirectives(source, rangesToRemove);

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
      // Use original module ID for re-exports, current module ID for local exports
      const targetModuleId = exp.originalModuleId || moduleId;
      registrations.push(
        `${loader?.registerServerReferenceName}(${exp.localName}, "${targetModuleId}", "${exp.exportName}");`
      );
    }
  }

  // Also handle client components in server environment
  // Check if this is a client component by checking for client directive
  const hasClientDirective = parseResult.directiveInfo?.fileLevel?.type === "client";
  
  let finalCode = transformedCode;
  let imports = [];
  
  // Add server reference imports and registrations if needed
  if (registrations.length > 0) {
    imports.push(`import { ${loader?.registerServerReferenceName} } from "${loader?.importServerPath}";`);
    finalCode = `${finalCode}\n${registrations.join("\n")}`;
  }
  
  // Add client reference imports and registrations if this is a client component
  if (hasClientDirective) {
    imports.push(`import { ${loader?.registerClientReferenceName} } from "${loader?.importClientPath}";`);
    const clientRegistrations = [];
    for (const exp of parseResult.exports.exports.values()) {
      if (exp.exportName === "default") {
        clientRegistrations.push(
          `export default ${loader?.registerClientReferenceName}(function() { throw new Error("Attempted to call default() on the client"); }, "${moduleId}", "default");`
        );
      } else {
        clientRegistrations.push(
          `export const ${exp.exportName} = ${loader?.registerClientReferenceName}(function() { throw new Error("Attempted to call ${exp.exportName}() on the client"); }, "${moduleId}", "${exp.exportName}");`
        );
      }
    }
    finalCode = `${finalCode}\n${clientRegistrations.join("\n")}`;
  }
  
  // Add imports at the top if any
  if (imports.length > 0) {
    finalCode = `${imports.join("\n")}\n${finalCode}`;
  }

  // Create source map based on the final transformed code
  const map = createSourceMap(finalCode, source, moduleId, []);

  return {
    code: finalCode,
    map,
  };
}
