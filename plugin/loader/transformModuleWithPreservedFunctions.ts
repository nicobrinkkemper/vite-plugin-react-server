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
import { handleExports } from "./handleExports.js";
import type { Program } from "./types.js";
import { createMappingsSerializer } from "../source-map/createMappingsSerializer.js";

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
  program: Program,
  isServerFunction: boolean | RegExpMatchArray | null,
  isClientComponent: boolean | RegExpMatchArray | null
): string {
  // Find and remove directives using AST
  let sourceWithoutDirective = source;
  let directiveEnd = 0;
  
  // Only look at top-level directives
  for (const node of program.body) {
    if (node.type !== "ExpressionStatement") {
      break;
    }

    let directive: string | null = null;
    if ("directive" in node && typeof node.directive === "string") {
      directive = node.directive;
    } else if (
      node.expression.type === "Literal" &&
      typeof node.expression.value === "string" &&
      (node.expression.value === "use server" || node.expression.value === "use client")
    ) {
      directive = node.expression.value;
    }

    if (directive && "start" in node && "end" in node) {
      directiveEnd = node.end;
    }
  }

  // Remove the directive and any whitespace after it
  if (directiveEnd > 0) {
    sourceWithoutDirective = source.slice(directiveEnd).trim();
  }

  // Get export names and create module ID literal
  const { exportNames, exports } = handleExports(
    sourceWithoutDirective,
    program,
    isServerFunction,
    isClientComponent
  );
  const moduleIdLiteral = JSON.stringify(moduleId);

  // For server modules in server environment, register server references
  if (Boolean(isServerFunction)) {
    const imports = [
      'import { registerServerReference } from "react-server-dom-esm/server.node";',
    ];
    const registrations: string[] = [];

    // Register each export
    for (const name of exportNames) {
      const exportInfo = exports.get(name);
      if (exportInfo) {
        // For default exports, use the localName if available
        const exportName =
          name === "default" && exportInfo.localName
            ? exportInfo.localName
            : name;
        // Register all exports in server modules
        registrations.push(
          `registerServerReference(${exportName}, ${moduleIdLiteral}, ${JSON.stringify(
            name
          )});`
        );
      }
    }

    // Create new source with registrations
    // First, add the imports at the top
    const newSource = [...imports, sourceWithoutDirective, ...registrations].join("\n\n");

    // Handle source maps
    let mappings = "";
    const createMapping = createMappingsSerializer();
    let generatedLine = 1;

    // Map the import line to the first line of the original source
    createMapping(generatedLine, 0, 0, 0, 0, -1);
    generatedLine++;

    // Map the registration lines to the first line of the original source
    for (let i = 0; i < registrations.length; i++) {
      createMapping(generatedLine, 0, 0, 1, 0, -1);
      generatedLine++;
    }

    // Map the original source lines, skipping the directive line
    const sourceLines = source.split("\n");
    for (let i = 0; i < sourceLines.length; i++) {
      createMapping(generatedLine, 0, 0, i + 1, 0, -1); // +1 because we skip directive line
      generatedLine++;
    }

    // Add source map to the output with original source content
    const sourceMap = {
      version: 3,
      file: moduleId,
      sources: [moduleId],
      sourcesContent: [newSource], // Use transformed source content
      mappings,
      sourceRoot: "",
      names: [],
    };

    return (
      newSource +
      "\n//# sourceMappingURL=data:application/json;charset=utf-8;base64," +
      Buffer.from(JSON.stringify(sourceMap)).toString("base64")
    );
    // end of server module
  }
  if (!!isClientComponent) {
    // For client modules in server environment, register client references
    const imports = [
      'import { registerClientReference } from "react-server-dom-esm/server.node";',
    ];
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

    // Handle source maps for client modules
    let mappings = "";
    const createMapping = createMappingsSerializer();
    let generatedLine = 1;

    // Map the import line to the first line of the original source
    createMapping(generatedLine, 0, 0, 0, 0, -1);
    generatedLine++;

    // Map the declaration lines to the first line of the original source
    for (let i = 0; i < declarations.length; i++) {
      createMapping(generatedLine, 0, 0, 1, 0, -1);
      generatedLine++;
    }

    // Add source map to the output with original source content
    const sourceMap = {
      version: 3,
      file: moduleId,
      sources: [moduleId],
      sourcesContent: [newSource], // Use transformed source content
      mappings,
      sourceRoot: "",
      names: [],
    };

    return (
      newSource +
      "\n//# sourceMappingURL=data:application/json;charset=utf-8;base64," +
      Buffer.from(JSON.stringify(sourceMap)).toString("base64")
    );
  }
  throw new Error("Invalid module type");
}
