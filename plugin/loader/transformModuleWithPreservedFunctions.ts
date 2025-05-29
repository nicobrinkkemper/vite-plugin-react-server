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
  isServerFunction: boolean | RegExpMatchArray | null,
  isClientComponent: boolean | RegExpMatchArray | null,
): { source: string; map: RawSourceMap | null } {

  // Get export names and create module ID literal
  const { exportNames, exports } = handleExports(source, program, isServerFunction, isClientComponent);
  const moduleIdLiteral = JSON.stringify(moduleId);

  // For server modules in server environment, register server references
  if (isServerFunction) {
    const imports = ['import { registerServerReference } from "react-server-dom-esm/server.node";'];
    const registrations: string[] = [];

    // Register each export
    for (const name of exportNames) {
      const exportInfo = exports.get(name);
      if (exportInfo) {
        // For default exports, use the localName if available
        const exportName = name === "default" && exportInfo.localName ? exportInfo.localName : name;
        // Register all exports in server modules
        registrations.push(
          `registerServerReference(${exportName}, ${moduleIdLiteral}, ${JSON.stringify(name)});`
        );
      }
    }

    // Create new source with registrations
    // First, add the imports at the top
    const newSource = [...imports, source].join("\n\n");
    // Then, add the registrations at the end
    const finalSource = newSource + "\n\n" + registrations.join("\n");

    // Don't create source maps for RSC modules
    return { source: finalSource, map: null };
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
