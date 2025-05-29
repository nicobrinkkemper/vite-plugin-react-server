/**
 * # RSC Boundary Handling
 *
 * This file provides the core transformation logic for React Server Components (RSC) boundaries.
 *
 * - **Server Loader**: Always strips implementation for client modules, exports error-throwing references.
 * - **Client Loader**: Always strips implementation for server modules, exports error-throwing references.
 * - **Browser**: Only client modules are passed through as-is.
 *
 * All transformations are handled by `transformModuleWithPreservedFunctions` for consistency.
 *
 * ## Error Behavior
 *
 * - If a client component is imported on the server, the export is a function that throws a clear error.
 * - If a server action is imported on the client, the export is a function that throws a clear error.
 *
 * This ensures that implementation details are never leaked across boundaries and errors are easy to debug.
 */
import type {
  ExportDefaultDeclaration,
  ExportNamedDeclaration,
  Statement,
  ModuleDeclaration
} from "acorn";
import type { RawSourceMap } from "source-map-js";
import { handleExports } from "./handleExports.js";
import type { Program } from "./types.js";

export interface TransformOptions {
  id: string;
  exportNames: string[];
  beforeExports: string;
  afterExports: string;
  isServerModule?: boolean;
  isClientModule?: boolean;
  program?: Program;
}

/**
 * Creates a client reference error message
 */
function createClientReferenceError(name: string): string {
  return `Attempted to call ${name}() from the server but ${name} is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.`;
}

function isExportNamedDeclaration(node: Statement | ModuleDeclaration): node is ExportNamedDeclaration {
  return node.type === "ExportNamedDeclaration";
}

function hasDeclaration(node: ExportNamedDeclaration): node is ExportNamedDeclaration & { declaration: { type: "FunctionDeclaration" | "ClassDeclaration" | "VariableDeclaration" } } {
  return node.declaration !== null && 
         node.declaration !== undefined &&
         (node.declaration.type === "FunctionDeclaration" ||
          node.declaration.type === "ClassDeclaration" ||
          node.declaration.type === "VariableDeclaration");
}

function hasFunctionOrClassDeclaration(node: ExportNamedDeclaration & { declaration: { type: "FunctionDeclaration" | "ClassDeclaration" | "VariableDeclaration" } }): node is ExportNamedDeclaration & { declaration: { type: "FunctionDeclaration" | "ClassDeclaration" } } {
  return node.declaration.type === "FunctionDeclaration" || node.declaration.type === "ClassDeclaration";
}

function hasVariableDeclaration(node: ExportNamedDeclaration & { declaration: { type: "FunctionDeclaration" | "ClassDeclaration" | "VariableDeclaration" } }): node is ExportNamedDeclaration & { declaration: { type: "VariableDeclaration" } } {
  return node.declaration.type === "VariableDeclaration";
}

/**
 * Transforms a module for RSC boundaries.
 * - Server modules: exports are wrapped with server references while preserving functionality.
 * - Client modules: exports are replaced with client references or errors, depending on environment.
 * - Only the correct references are exported; implementation is never leaked across boundaries.
 *
 * @param source - The original module source code.
 * @param moduleId - The module's unique identifier.
 * @param url - The module's URL.
 * @param program - The parsed AST.
 * @param map - The source map for the source code.
 * @param isServerFunction - Whether the module is a server function.
 * @param isClientComponent - Whether the module is a client component.
 * @returns The transformed source code.
 */
export function transformModuleWithPreservedFunctions(
  source: string,
  moduleId: string,
  _url: string,
  program: Program,
  map: RawSourceMap | null,
  isServerFunction: RegExpMatchArray | null,
  isClientComponent: RegExpMatchArray | null,
): { source: string; map: RawSourceMap | null } {

  // Get export names and create module ID literal
  const { exportNames } = handleExports(source, program, isServerFunction, isClientComponent);
  const moduleIdLiteral = JSON.stringify(moduleId);

  // For server modules in server environment, register server references
  if (isServerFunction) {
    const imports = ['import { registerServerReference } from "react-server-dom-esm/server.node";'];
    const registrations: string[] = [];

    // Register each function
    for (const name of exportNames) {
      if (name === "default") {
        // For default exports, we need to find the actual function name
        const defaultExport = program.body.find(
          (node): node is ExportDefaultDeclaration =>
            node.type === "ExportDefaultDeclaration" &&
            (node.declaration.type === "FunctionDeclaration" ||
             node.declaration.type === "ClassDeclaration" ||
             node.declaration.type === "ArrowFunctionExpression") &&
            (node.declaration.type === "FunctionDeclaration" || node.declaration.type === "ClassDeclaration") &&
            node.declaration.id !== null
        );
        if ((defaultExport?.declaration.type === "FunctionDeclaration" || defaultExport?.declaration.type === "ClassDeclaration") && defaultExport.declaration.id) {
          const funcName = defaultExport.declaration.id.name;
          registrations.push(
            `registerServerReference(${funcName}, ${moduleIdLiteral}, "default");`
          );
        }
      } else {
        // Find the original function name and location
        const namedExport = program.body.find(
          (node): node is ExportNamedDeclaration & { declaration: { type: "FunctionDeclaration" | "ClassDeclaration" | "VariableDeclaration" } } =>
            isExportNamedDeclaration(node) && hasDeclaration(node) &&
            ((hasFunctionOrClassDeclaration(node) && node.declaration.id?.name === name) ||
             (hasVariableDeclaration(node) &&
              node.declaration.declarations[0]?.id?.type === "Identifier" &&
              node.declaration.declarations[0]?.id?.name === name))
        );
        if (namedExport && hasFunctionOrClassDeclaration(namedExport) && namedExport.declaration.id) {
          const funcName = namedExport.declaration.id.name;
          registrations.push(
            `registerServerReference(${funcName}, ${moduleIdLiteral}, ${JSON.stringify(name)});`
          );
        } else if (namedExport && hasVariableDeclaration(namedExport) && 
                  namedExport.declaration.declarations[0]?.id?.type === "Identifier" && 
                  namedExport.declaration.declarations[0]?.id?.name === name) {
          const funcName = namedExport.declaration.declarations[0].id.name;
          registrations.push(
            `registerServerReference(${funcName}, ${moduleIdLiteral}, ${JSON.stringify(name)});`
          );
        }
      }
    }

    // Create new source with registrations
    const newSource = source + "\n\n" + [...imports, ...registrations].join("\n\n");

    // Don't create source maps for RSC modules
    return { source: newSource, map: null };
  }

  // For client modules in server environment, register client references
  if (isClientComponent) {
    const imports = ['import { registerClientReference } from "react-server-dom-esm/server.node";'];
    const declarations: string[] = [];

    for (const name of exportNames) {
      const errorMessage = createClientReferenceError(name);
      if (name === "default") {
        declarations.push(`export default registerClientReference(function() {
  throw new Error("${errorMessage}");
}, ${moduleIdLiteral}, "default");`);
      } else {
        declarations.push(`export const ${name} = registerClientReference(function() {
  throw new Error("${errorMessage}");
}, ${moduleIdLiteral}, ${JSON.stringify(name)});`);
      }
    }

    // Create new source with declarations
    const newSource = [...imports, ...declarations].join("\n\n");

    // Don't create source maps for RSC modules
    return { source: newSource, map: null };
  }

  // For other cases, return original source
  return { source, map: map };
}
