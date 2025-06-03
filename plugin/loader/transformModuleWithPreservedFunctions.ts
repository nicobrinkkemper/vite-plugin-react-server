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

// Helper type for mapping info
interface MappingInfo {
  generatedLine: number;
  originalLine: number;
  originalColumn: number;
}

function generateSourceMap(
  moduleId: string,
  source: string,
  lines: string[],
  mappingInfos: MappingInfo[],
  originalSourceMap?: any
) {
  const createMapping = createMappingsSerializer();
  let mappings = '';

  // Create a mapping for each line
  for (let i = 0; i < lines.length; i++) {
    const info = mappingInfos[i] || { generatedLine: i + 1, originalLine: 1, originalColumn: 0 };
    mappings += createMapping(
      info.generatedLine,
      0,
      0, // sourceIndex
      info.originalLine,
      info.originalColumn,
      -1 // nameIndex
    );
  }

  // Add a final mapping for the end of the file
  mappings += createMapping(
    lines.length + 1,
    0,
    0,
    source.split('\n').length,
    0,
    -1
  );

  const sourceMap = {
    version: 3,
    file: moduleId,
    sources: originalSourceMap?.sources || [moduleId],
    sourcesContent: originalSourceMap?.sourcesContent || [source],
    mappings,
    sourceRoot: originalSourceMap?.sourceRoot || "",
    names: originalSourceMap?.names || [],
  };

  return `data:application/json;charset=utf-8;base64,${Buffer.from(JSON.stringify(sourceMap)).toString("base64")}`;
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
  // Check for existing source map
  let sourceMappingURL = null;
  let sourceMappingStart = 0;
  let sourceMappingEnd = 0;
  let sourceMappingLines = 0;
  let originalSourceMap = null;

  // Look for source map comment
  const sourceMapMatch = source.match(/\/\/[#@] sourceMappingURL=(.+)$/m);
  if (sourceMapMatch) {
    sourceMappingURL = sourceMapMatch[1];
    sourceMappingStart = sourceMapMatch.index!;
    sourceMappingEnd = sourceMapMatch.index! + sourceMapMatch[0].length;
    sourceMappingLines = sourceMapMatch[0].split('\n').length - 1;

    // If it's a data URL, parse it
    if (sourceMappingURL.startsWith('data:application/json;base64,')) {
      const base64 = sourceMappingURL.slice('data:application/json;base64,'.length);
      originalSourceMap = JSON.parse(Buffer.from(base64, 'base64').toString());
    }
  }

  // Remove the old source map if present
  let sourceWithoutMap = source;
  if (sourceMappingStart > 0) {
    sourceWithoutMap = source.slice(0, sourceMappingStart) + '\n'.repeat(sourceMappingLines) + source.slice(sourceMappingEnd);
  }

  // Remove directives from source code
  let sourceWithoutDirective = sourceWithoutMap;
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

  // For client modules in server environment, replace with client references
  if (Boolean(isClientComponent)) {
    const output: string[] = [];
    const mappingInfos: MappingInfo[] = [];

    // Add registerClientReference import
    const clientImport = process.env['NODE_ENV'] === 'production'
      ? 'import { registerClientReference } from "react-server-dom-esm/server";'
      : 'import { registerClientReference } from "react-server-dom-esm/server.node";';
    output.push(clientImport);
    mappingInfos.push({ generatedLine: 1, originalLine: 1, originalColumn: 0 });

    // Register each export
    let lineNum = 2;
    for (const name of exportNames) {
      const exportInfo = exports.get(name);
      if (exportInfo) {
        // For default exports, use the localName if available
        const exportName =
          name === "default" && exportInfo.localName
            ? exportInfo.localName
            : name;
        if (name === 'default') {
          output.push(
            `export default registerClientReference(function() {` +
            `throw new Error("Attempted to call the default export of ${moduleIdLiteral} from the server but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");` +
            `}, ${moduleIdLiteral}, "default");`
          );
        } else {
          output.push(
            `export const ${exportName} = registerClientReference(function() {` +
            `throw new Error("Attempted to call ${exportName}() from the server but ${exportName} is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");` +
            `}, ${moduleIdLiteral}, ${JSON.stringify(name)});`
          );
        }
        // Create a mapping for each registration line
        mappingInfos.push({ 
          generatedLine: lineNum, 
          originalLine: exportInfo.loc?.line || 1, 
          originalColumn: exportInfo.loc?.column || 0 
        });
        lineNum++;
      }
    }

    const newClientSource = output.join("\n\n");
    const sourceMapBase64 = generateSourceMap(
      moduleId,
      source,
      output,
      mappingInfos,
      originalSourceMap
    );
    return `${newClientSource}\n//# sourceMappingURL=${sourceMapBase64}`;
  }

  // For server modules in client environment, replace with server references
  if (Boolean(isServerFunction)) {
    // First collect all exports that need registration
    const exportedEntries: Array<{ localName: string; exportedName: string; type: string; loc?: { line: number; column: number } }> = [];
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

      // Collect exports that need registration, with loc
      switch (node.type) {
        case 'ExportDefaultDeclaration':
          if (node.declaration.type === 'FunctionDeclaration' && node.declaration.id) {
            const name = node.declaration.id.name;
            if (hasServerDirective(node.declaration)) {
              exportedEntries.push({
                localName: name,
                exportedName: 'default',
                type: 'function',
                loc: node.declaration.id.loc?.start || { line: 1, column: 0 }
              });
              localNames.add(name);
            }
          } else if (node.declaration.type === 'ClassDeclaration' && node.declaration.id) {
            const name = node.declaration.id.name;
            exportedEntries.push({
              localName: name,
              exportedName: 'default',
              type: 'class',
              loc: node.declaration.id.loc?.start || { line: 1, column: 0 }
            });
            localNames.add(name);
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
                  type: 'function',
                  loc: node.declaration.id.loc?.start || { line: 1, column: 0 }
                });
                localNames.add(name);
              }
            } else if (node.declaration.type === 'ClassDeclaration' && node.declaration.id) {
              const name = node.declaration.id.name;
              exportedEntries.push({
                localName: name,
                exportedName: name,
                type: 'class',
                loc: node.declaration.id.loc?.start || { line: 1, column: 0 }
              });
              localNames.add(name);
            } else if (node.declaration.type === 'VariableDeclaration') {
              for (const decl of node.declaration.declarations) {
                if (decl.id.type === 'Identifier') {
                  const name = decl.id.name;
                  if (decl.init) {
                    if (decl.init.type === 'FunctionExpression' || decl.init.type === 'ArrowFunctionExpression') {
                      if (hasServerDirective(decl.init)) {
                        exportedEntries.push({
                          localName: name,
                          exportedName: name,
                          type: 'function',
                          loc: decl.id.loc?.start || { line: 1, column: 0 }
                        });
                        localNames.add(name);
                      }
                    } else {
                      // Register non-function values
                      exportedEntries.push({
                        localName: name,
                        exportedName: name,
                        type: 'value',
                        loc: decl.id.loc?.start || { line: 1, column: 0 }
                      });
                      localNames.add(name);
                    }
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
                    (n.type === 'ClassDeclaration' && n.id?.name === localName) ||
                    (n.type === 'VariableDeclaration' && n.declarations.some(d => 
                      d.id.type === 'Identifier' && d.id.name === localName
                    ))
                  );
                  let loc = { line: 1, column: 0 };
                  if (originalDecl) {
                    if (originalDecl.type === 'FunctionDeclaration' && hasServerDirective(originalDecl)) {
                      loc = originalDecl.id?.loc?.start || loc;
                      exportedEntries.push({
                        localName,
                        exportedName,
                        type: 'function',
                        loc
                      });
                      localNames.add(localName);
                    } else if (originalDecl.type === 'ClassDeclaration') {
                      loc = originalDecl.id?.loc?.start || loc;
                      exportedEntries.push({
                        localName,
                        exportedName,
                        type: 'class',
                        loc
                      });
                      localNames.add(localName);
                    } else if (originalDecl.type === 'VariableDeclaration') {
                      // Find the right declaration
                      const decl = originalDecl.declarations.find(d => d.id.type === 'Identifier' && d.id.name === localName);
                      loc = decl?.id?.loc?.start || loc;
                      exportedEntries.push({
                        localName,
                        exportedName,
                        type: 'value',
                        loc
                      });
                      localNames.add(localName);
                    }
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
    const lines: string[] = [];
    const mappingInfos: MappingInfo[] = [];
    
    // Add import statement
    const serverImport = process.env['NODE_ENV'] === 'production' 
      ? 'import { registerServerReference } from "react-server-dom-esm/server";'
      : 'import { registerServerReference } from "react-server-dom-esm/server.node";';
    lines.push(serverImport);
    mappingInfos.push({ generatedLine: 1, originalLine: 1, originalColumn: 0 });

    // Add the original source code
    lines.push(newSource);
    mappingInfos.push({ generatedLine: 2, originalLine: 1, originalColumn: 0 });

    // Add registrations after the source code
    let lineNum = lines.length + 1;
    for (const entry of exportedEntries) {
      if (entry.type === 'function') {
        lines.push(`if (typeof ${entry.localName} === "function") `);
      }
      lines.push(`registerServerReference(${entry.localName}, ${JSON.stringify(moduleId)}, ${JSON.stringify(entry.exportedName)});`);
      // Create a mapping for each registration line
      mappingInfos.push({ 
        generatedLine: lineNum, 
        originalLine: entry.loc?.line || 1, 
        originalColumn: entry.loc?.column || 0 
      });
      lineNum++;
    }

    const newTransformedSource = lines.join('\n');
    const sourceMapBase64 = generateSourceMap(
      moduleId,
      source,
      lines,
      mappingInfos,
      originalSourceMap
    );
    return `${newTransformedSource}\n//# sourceMappingURL=${sourceMapBase64}`;
  }

  // For non-server, non-client modules, return as is
  return sourceWithoutMap;
}
