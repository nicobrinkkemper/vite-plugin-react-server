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

function createSourceMap(id: string, code: string, mappings: string) {
  return {
    version: 3,
    file: id,
    sources: [id],
    sourcesContent: [code],
    mappings,
    sourceRoot: "",
    names: [],
  };
}

function generateSourceMap(moduleId: string, source: string, lines: string[], isImportOrRegistration: (line: string) => boolean) {
  const createMapping = createMappingsSerializer();
  let generatedLine = 1;
  let generatedColumn = 0;

  for (let i = 0; i < lines.length; i++) {
    const originalLine = isImportOrRegistration(lines[i]) ? 1 : Math.max(1, i - 1);
    createMapping(generatedLine, generatedColumn, 0, originalLine, 0, -1);
    generatedLine++;
  }

  const sourceMap = createSourceMap(moduleId, source, createMapping(generatedLine, generatedColumn, 0, lines.length, 0, -1));
  const sourceMapJson = JSON.stringify(sourceMap);
  return `data:application/json;charset=utf-8;base64,${Buffer.from(sourceMapJson).toString("base64")}`;
}

/**
 * --- React RSC Directive Handling ---
 *
 * 1. 'use client' at file top:
 *    - Pass through code as-is (after removing directive).
 *    - Do not transform or register anything.
 *    - Required for React client features to work.
 *    - See: https://react.dev/reference/rsc/use-client
 *
 * 2. 'use server' at file top:
 *    - Register all exported async functions as server actions.
 *    - See: https://react.dev/reference/rsc/use-server#caveats
 *
 * 3. 'use server' at function top:
 *    - Register only that async function as a server action.
 *    - See: https://react.dev/reference/rsc/use-server#caveats
 *
 * 4. No directive:
 *    - Treat as a normal shared or server-only module.
 *    - No special registration or transformation.
 */

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
  // Remove directives from source code
  let sourceWithoutDirective = source;
  let directiveEnd = 0;
  let hasFileLevelServerDirective = false;
  let hasFileLevelClientDirective = false;
  let hasFunctionLevelClientDirective = false;
  let hasFunctionLevelServerDirective = false;

  // Get export names and create module ID literal
  const { exportNames, exports } = handleExports(
    sourceWithoutDirective,
    program,
    isServerFunction,
    isClientComponent
  );
  const moduleIdLiteral = JSON.stringify(moduleId);

  // Helper function to check for directives in a node
  function checkForDirective(node: any): string | null {
    if (node.type === "ExpressionStatement") {
      if ("directive" in node && typeof node.directive === "string") {
        return node.directive;
      } else if (
        node.expression.type === "Literal" &&
        typeof node.expression.value === "string" &&
        (node.expression.value === "use server" || node.expression.value === "use client")
      ) {
        return node.expression.value;
      }
    }
    return null;
  }

  // Check for file-level and function-level directives
  for (const node of program.body) {
    const directive = checkForDirective(node);
    if (directive) {
      if (directive === "use server") {
        if (node.start === 0) {
          hasFileLevelServerDirective = true;
        } else {
          hasFunctionLevelServerDirective = true;
        }
      }
      if (directive === "use client") {
        if (node.start === 0) {
          hasFileLevelClientDirective = true;
        } else {
          hasFunctionLevelClientDirective = true;
        }
      }
      if ("start" in node && "end" in node) {
        directiveEnd = Math.max(directiveEnd, node.end);
      }
    }

    // Check for function-level server directives in function bodies
    if (node.type === "ExportNamedDeclaration" && node.declaration?.type === "FunctionDeclaration") {
      const funcNode = node.declaration;
      if (funcNode.body?.body) {
        for (const stmt of funcNode.body.body) {
          const directive = checkForDirective(stmt);
          if (directive === "use server") {
            hasFunctionLevelServerDirective = true;
            // Mark this specific function as having a server directive
            const name = funcNode.id?.name;
            if (name) {
              const exportInfo = exports.get(name);
              if (exportInfo) {
                exportInfo.declaration = exportInfo.declaration?.replace(
                  /^export\s+function\s+/,
                  'export async function '
                );
                exportInfo.isAsync = true;
              }
            }
            break;
          }
        }
      }
    } else if (node.type === "FunctionDeclaration") {
      if (node.body?.body) {
        for (const stmt of node.body.body) {
          const directive = checkForDirective(stmt);
          if (directive === "use server") {
            hasFunctionLevelServerDirective = true;
            // Mark this specific function as having a server directive
            const name = node.id?.name;
            if (name) {
              const exportInfo = exports.get(name);
              if (exportInfo) {
                exportInfo.declaration = exportInfo.declaration?.replace(
                  /^export\s+function\s+/,
                  'export async function '
                );
                exportInfo.isAsync = true;
              }
            }
            break;
          }
        }
      }
    } else if (node.type === "VariableDeclaration") {
      for (const decl of node.declarations) {
        if (decl.init?.type === "FunctionExpression" || decl.init?.type === "ArrowFunctionExpression") {
          const body = decl.init.body;
          if (body.type === "BlockStatement" && body.body) {
            for (const stmt of body.body) {
              const directive = checkForDirective(stmt);
              if (directive === "use server") {
                hasFunctionLevelServerDirective = true;
                const name = decl.id.type === "Identifier" ? decl.id.name : undefined;
                if (name) {
                  const exportInfo = exports.get(name);
                  if (exportInfo) {
                    exportInfo.declaration = exportInfo.declaration?.replace(
                      /^export\s+function\s+/,
                      'export async function '
                    );
                    exportInfo.isAsync = true;
                  }
                }
                break;
              }
            }
          }
        }
      }
    }
  }

  // Validate directive combinations
  if (hasFileLevelClientDirective && hasFileLevelServerDirective) {
    throw new Error(`Module ${moduleId} cannot have both "use client" and "use server" directives`);
  }

  if (hasFunctionLevelClientDirective) {
    throw new Error(`Module ${moduleId} cannot have function-level "use client" directives - only file-level is allowed`);
  }

  // Validate against user's explicit intent
  if (Boolean(isClientComponent) && !hasFileLevelClientDirective) {
    throw new Error(`Module ${moduleId} is marked as a client component but has no "use client" directive`);
  }

  if (Boolean(isServerFunction) && !hasFileLevelServerDirective && !hasFunctionLevelServerDirective) {
    if(process.env['NODE_ENV'] !== "production") {
      console.log("Error for file", moduleId, source);
    }
    throw new Error(`Module ${moduleId} is marked as a server function but has no "use server" directive`);
  }

  // Remove the directive and any whitespace after it
  if (directiveEnd > 0) {
    sourceWithoutDirective = source.slice(directiveEnd).trim();
  }

  // Validate that there are exports to transform if explicitly marked
  if (Boolean(isClientComponent) && exportNames.length === 0) {
    throw new Error(`Module ${moduleId} is marked as a client component but has no exports to transform`);
  }

  if (Boolean(isServerFunction) && exportNames.length === 0) {
    throw new Error(`Module ${moduleId} is marked as a server function but has no exports to transform`);
  }

  // For server modules in client environment, replace with server references
  if (Boolean(isServerFunction)) {
    // First collect all exports that need registration
    const exportedEntries = [];
    const localNames = new Set();

    // Helper to check if a function has a "use server" directive
    function hasServerDirective(node: any): boolean {
      if (hasFileLevelServerDirective) return true;
      if (node.body?.body) {
        for (const stmt of node.body.body) {
          const directive = checkForDirective(stmt);
          if (directive === "use server") return true;
        }
      }
      return false;
    }

    // First pass: collect exports and remove directives
    let newSource = source;
    let directiveEnd = 0;

    for (const node of program.body) {
      // Handle directives
      const directive = checkForDirective(node);
      if (directive === "use server" || directive === "use client") {
        if (node.start === 0) {
          directiveEnd = node.end;
        } else {
          // Remove function-level directive
          newSource = newSource.slice(0, node.start) + newSource.slice(node.end);
        }
        continue;
      }

      // Collect exports that need registration
      switch (node.type) {
        case 'ExportDefaultDeclaration':
          if (node.declaration.type === 'FunctionDeclaration' && node.declaration.id) {
            const name = node.declaration.id.name;
            if (hasServerDirective(node.declaration)) {
              exportedEntries.push({
                localName: name,
                exportedName: 'default',
                type: 'function'
              });
              localNames.add(name);
            }
          }
          break;
        case 'ExportNamedDeclaration':
          if (node.declaration) {
            if (node.declaration.type === 'FunctionDeclaration' && node.declaration.id) {
              const name = node.declaration.id.name;
              if (hasServerDirective(node.declaration)) {
                exportedEntries.push({
                  localName: name,
                  exportedName: name,
                  type: 'function'
                });
                localNames.add(name);
              }
            } else if (node.declaration.type === 'VariableDeclaration') {
              for (const decl of node.declaration.declarations) {
                if (decl.id.type === 'Identifier' && 
                    decl.init && 
                    (decl.init.type === 'FunctionExpression' || decl.init.type === 'ArrowFunctionExpression')) {
                  const name = decl.id.name;
                  if (hasServerDirective(decl.init)) {
                    exportedEntries.push({
                      localName: name,
                      exportedName: name,
                      type: 'function'
                    });
                    localNames.add(name);
                  }
                }
              }
            }
          }
          if (node.specifiers) {
            for (const spec of node.specifiers) {
              if (spec.type === 'ExportSpecifier') {
                const localName = spec.local.type === 'Identifier' ? spec.local.name : '';
                const exportedName = spec.exported.type === 'Identifier' ? spec.exported.name : '';
                if (localName && exportedName) {
                  // Find the original declaration to check for directive
                  const originalDecl = program.body.find(n => 
                    (n.type === 'FunctionDeclaration' && n.id?.name === localName) ||
                    (n.type === 'VariableDeclaration' && n.declarations.some(d => 
                      d.id.type === 'Identifier' && d.id.name === localName &&
                      d.init && (d.init.type === 'FunctionExpression' || d.init.type === 'ArrowFunctionExpression')
                    ))
                  );
                  if (originalDecl && hasServerDirective(originalDecl)) {
                    exportedEntries.push({
                      localName,
                      exportedName,
                      type: 'function'
                    });
                    localNames.add(localName);
                  }
                }
              }
            }
          }
          break;
      }
    }

    // Remove file-level directive if present
    if (directiveEnd > 0) {
      newSource = newSource.slice(directiveEnd).trim();
    }

    // Add import and registrations
    newSource += '\n\n';
    newSource += 'import { registerServerReference } from "react-server-dom-esm/server.node";\n';

    // Add registrations for each export
    for (const entry of exportedEntries) {
      const moduleIdWithExport = `${moduleId}#${entry.exportedName}`;
      newSource += `registerServerReference(${entry.localName}, ${JSON.stringify(moduleIdWithExport)}, ${JSON.stringify(entry.exportedName)});\n`;
    }

    // Add source map
    const sourceMapBase64 = generateSourceMap(
      moduleId,
      source,
      newSource.split('\n'),
      line => line.includes('import {') || line.includes('registerServerReference')
    );
    return `${newSource}\n//# sourceMappingURL=${sourceMapBase64}`;
  }

  // For client modules in server environment, replace with client references
  if (Boolean(isClientComponent)) {
    const output: string[] = [];
    const registrations: string[] = [];

    // Add imports first
    output.push('import { registerClientReference } from "react-server-dom-esm/server.node";');

    // Register each export (skip default if not a function/class)
    for (const name of exportNames) {
      const exportInfo = exports.get(name);
      if (exportInfo) {
        // For default exports, use the localName if available
        const exportName =
          name === "default" && exportInfo.localName
            ? exportInfo.localName
            : name;
        // Only register functions and classes
        if (exportInfo.type === "function" || exportInfo.type === "class") {
          registrations.push(
            `registerClientReference(${exportName}, ${moduleIdLiteral}, ${JSON.stringify(name)});`
          );
        }
      }
    }

    // Add the source code without directives
    output.push(sourceWithoutDirective);
    // Add registrations
    output.push(...registrations);

    const newSource = output.join("\n\n");
    const sourceMapBase64 = generateSourceMap(
      moduleId,
      source,
      output,
      line => line.includes('import {') || line.includes('registerClientReference')
    );
    return `${newSource}\n//# sourceMappingURL=${sourceMapBase64}`;
  }

  // For non-server, non-client modules, return as is
  return sourceWithoutDirective;
}
