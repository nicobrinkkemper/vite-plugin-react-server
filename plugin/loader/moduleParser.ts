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

import * as acorn from "acorn-loose";
import type {
  Identifier,
  Property,
  Pattern,
  ExportAllDeclaration,
  ExportDefaultDeclaration,
  ExportNamedDeclaration,
  AssignmentProperty,
  Expression,
  Program as AcornProgram,
  Statement,
  ModuleDeclaration,
  ParenthesizedExpression,
} from "acorn";
import { resolveClientImport } from "../helpers/moduleResolver.js";
import type { RawSourceMap } from "source-map-js";

// Add isDev check at the top level
const isDev = process.env["NODE_ENV"] !== "production";

// Directive is a special type in Acorn that extends ExpressionStatement
type Directive = Statement & {
  directive: string;
};

export type Program = AcornProgram & {
  start: number;
  end: number;
  body: (Directive | Statement | ModuleDeclaration)[];
};

export interface TransformOptions {
  id: string;
  exportNames: string[];
  beforeExports: string;
  afterExports: string;
  isServerModule?: boolean;
  isClientModule?: boolean;
  program?: Program;
}

export function addExportNames(
  names: Identifier["name"][],
  node:
    | Expression
    | Pattern
    | AssignmentProperty
    | Property
    | ParenthesizedExpression
    | ExportAllDeclaration
    | ExportDefaultDeclaration
    | ExportNamedDeclaration
) {
  switch (node.type) {
    case "Identifier":
      names.push(node.name);
      return;

    case "ObjectPattern":
      for (let i = 0; i < node.properties.length; i++)
        addExportNames(names, node.properties[i]);
      return;

    case "ArrayPattern":
      for (let i = 0; i < node.elements.length; i++) {
        const element = node.elements[i];
        if (element) addExportNames(names, element);
      }
      return;

    case "Property":
      addExportNames(names, node.value);
      return;

    case "AssignmentPattern":
      addExportNames(names, node.left);
      return;

    case "RestElement":
      addExportNames(names, node.argument);
      return;

    case "ParenthesizedExpression":
      addExportNames(names, node.expression);
      return;
  }
}

export function addExportedEntry(
  exportedEntries: any[],
  localNames: Set<string>,
  localName: string,
  exportedName: string,
  type: string | null,
  loc: any
) {
  if (localNames.has(localName)) {
    // If the same local name is exported more than once, we only need one of the names.
    return;
  }

  exportedEntries.push({
    localName,
    exportedName,
    type,
    loc,
    originalLine: -1,
    originalColumn: -1,
    originalSource: -1,
    nameIndex: -1,
  });
}

export function addLocalExportedNames(
  exportedEntries: any[],
  localNames: Set<string>,
  node: any
) {
  switch (node.type) {
    case "Identifier":
      addExportedEntry(
        exportedEntries,
        localNames,
        node.name,
        node.name,
        null,
        node.loc
      );
      return;

    case "ObjectPattern":
      for (let i = 0; i < node.properties.length; i++)
        addLocalExportedNames(exportedEntries, localNames, node.properties[i]);
      return;

    case "ArrayPattern":
      for (let i = 0; i < node.elements.length; i++) {
        const element = node.elements[i];
        if (element)
          addLocalExportedNames(exportedEntries, localNames, element);
      }
      return;

    case "Property":
      addLocalExportedNames(exportedEntries, localNames, node.value);
      return;

    case "AssignmentPattern":
      addLocalExportedNames(exportedEntries, localNames, node.left);
      return;

    case "RestElement":
      addLocalExportedNames(exportedEntries, localNames, node.argument);
      return;

    case "ParenthesizedExpression":
      addLocalExportedNames(exportedEntries, localNames, node.expression);
      return;
  }
}

export async function parseExportNamesInto(
  body: any[],
  parentURL: string,
  loader: any
): Promise<string[]> {
  const names: string[] = [];

  for (let i = 0; i < body.length; i++) {
    const node = body[i];

    switch (node.type) {
      case "ExportAllDeclaration":
        if (node.exported) {
          addExportNames(names, node.exported);
          continue;
        } else {
          const resolved = await resolveClientImport(
            node.source.value,
            parentURL
          );

          if (!resolved) {
            console.warn(`Could not resolve import: ${node.source.value}`);
            continue;
          }

          const { url } = resolved;
          const { source } = await loader(url, {
            format: "module",
            conditions: [],
            importAttributes: {},
          });

          if (typeof source !== "string") {
            throw new Error("Expected the transformed source to be a string.");
          }

          let childBody;
          try {
            childBody = acorn.parse(source, {
              ecmaVersion: "2024" as never,
              sourceType: "module",
            }).body;
          } catch (x) {
            console.error("Error parsing %s %s", url, (x as Error)?.message);
            continue;
          }

          const childNames = await parseExportNamesInto(childBody, url, loader);
          names.push(...childNames);
          continue;
        }

      case "ExportDefaultDeclaration":
        names.push("default");
        continue;

      case "ExportNamedDeclaration":
        if (node.declaration) {
          if (node.declaration.type === "VariableDeclaration") {
            const declarations = node.declaration.declarations;
            for (let j = 0; j < declarations.length; j++) {
              addExportNames(names, declarations[j].id);
            }
          } else if (node.declaration.type === "FunctionDeclaration") {
            // Add the function name to exports
            if (node.declaration.id) {
              names.push(node.declaration.id.name);
            }
          } else {
            addExportNames(names, node.declaration.id);
          }
        }

        if (node.specifiers) {
          const specifiers = node.specifiers;
          for (let j = 0; j < specifiers.length; j++) {
            addExportNames(names, specifiers[j].exported);
          }
        }
        continue;

      case "FunctionDeclaration":
        // Handle standalone function declarations that are exported
        if (node.id) {
          names.push(node.id.name);
        }
        continue;
    }
  }

  return names;
}

export function handleExports(
  source: string,
  url: string,
  program: Program,
  isServerFunction: RegExpMatchArray | null,
  isClientComponent: RegExpMatchArray | null
): { imports: string[]; declarations: string[]; exportNames: string[] } {
  const imports: string[] = [];
  const declarations: string[] = [];
  const exportNames: string[] = [];

  // Track exports and their types
  const exports = new Map<
    string,
    {
      type: "function" | "class" | "variable" | "default";
      declaration?: string;
      localName?: string;
      before?: string[];
      after?: string[];
    }
  >();

  let lastEnd = 0;
  let currentBefore: string[] = [];
  let foundFirstExport = false;

  // First pass: collect all exports and code between them
  for (const node of program.body) {
    // Add any code before this node
    if (node.start > lastEnd) {
      const beforeCode = source.slice(lastEnd, node.start);
      if (beforeCode.trim()) {
        currentBefore.push(beforeCode);
      }
    }

    if (node.type === "ImportDeclaration") {
      imports.push(source.slice(node.start, node.end));
    } else if (node.type === "ExportNamedDeclaration") {
      if (!foundFirstExport) {
        // This is the first export, so all code before it goes into its before array
        foundFirstExport = true;
      }

      if (node.declaration) {
        // For exported declarations (function, class, var, etc)
        const declarationStart = node.start;
        const declarationEnd = node.end;
        const declaration = source.slice(declarationStart, declarationEnd);

        if (
          node.declaration.type === "FunctionDeclaration" &&
          node.declaration.id
        ) {
          const name = node.declaration.id.name;
          exports.set(name, { 
            type: "function", 
            declaration,
            before: [...currentBefore] // Copy the current before array
          });
          currentBefore = []; // Reset for next export
        } else if (
          node.declaration.type === "ClassDeclaration" &&
          node.declaration.id
        ) {
          const name = node.declaration.id.name;
          exports.set(name, { 
            type: "class", 
            declaration,
            before: [...currentBefore] // Copy the current before array
          });
          currentBefore = []; // Reset for next export
        } else if (node.declaration.type === "VariableDeclaration") {
          for (const decl of node.declaration.declarations) {
            if (decl.id && decl.id.type === "Identifier") {
              const name = decl.id.name;
              exports.set(name, { 
                type: "variable", 
                declaration,
                before: [...currentBefore] // Copy the current before array
              });
              currentBefore = []; // Reset for next export
            }
          }
        }
      }
      // For named exports (export { a, b, c })
      if (node.specifiers && node.specifiers.length > 0) {
        // For grouped exports, all specifiers share the same before/after code
        const beforeCode = [...currentBefore];
        currentBefore = [];
        
        for (const spec of node.specifiers) {
          if (spec.type === "ExportSpecifier") {
            const localName =
              spec.local.type === "Identifier" ? spec.local.name : "";
            const exportedName =
              spec.exported.type === "Identifier" ? spec.exported.name : "";
            if (localName && exportedName) {
              // Check if the local name is a function by looking for its declaration
              const functionMatch = source.match(
                new RegExp(
                  `(?:export\\s+)?(?:async\\s+)?function\\s+${localName}\\s*\\([^)]*\\)\\s*(?::\\s*[^{]*)?\\s*{[\\s\\S]*?\\n}`
                )
              );
              if (functionMatch) {
                exports.set(exportedName, { 
                  type: "function", 
                  localName,
                  declaration: functionMatch[0],
                  before: beforeCode // Share the same before code
                });
              } else {
                // Try a more flexible pattern that matches the entire function body
                const flexibleMatch = source.match(
                  new RegExp(
                    `(?:export\\s+)?(?:async\\s+)?function\\s+${localName}\\s*\\([^)]*\\)\\s*(?::\\s*[^{]*)?\\s*{[\\s\\S]*?\\n}`
                  )
                );
                if (flexibleMatch) {
                  exports.set(exportedName, { 
                    type: "function", 
                    localName,
                    declaration: flexibleMatch[0],
                    before: beforeCode // Share the same before code
                  });
                } else {
                  exports.set(exportedName, { 
                    type: "variable", 
                    localName,
                    before: beforeCode // Share the same before code
                  });
                }
              }
            }
          }
        }
      }
    } else if (node.type === "ExportDefaultDeclaration") {
      exports.set("default", { 
        type: "default",
        before: [...currentBefore] // Copy the current before array
      });
      currentBefore = []; // Reset for next export
    } else if (
      node.type === "FunctionDeclaration" ||
      node.type === "VariableDeclaration" ||
      node.type === "ClassDeclaration"
    ) {
      // For non-exported declarations, only keep them if they're not functions in server/client modules
      if (
        !(isServerFunction || isClientComponent) ||
        node.type !== "FunctionDeclaration"
      ) {
        declarations.push(source.slice(node.start, node.end));
      }
    }

    lastEnd = node.end;
  }

  // Add any remaining code after the last node
  if (lastEnd < source.length) {
    const afterCode = source.slice(lastEnd);
    if (afterCode.trim()) {
      // Add to the last export's after array
      const lastExport = Array.from(exports.values()).pop();
      if (lastExport) {
        lastExport.after = [afterCode];
      }
    }
  }

  // Second pass: generate transformed exports
  if (isServerFunction) {
    // For server modules, create server references
    for (const [name, info] of exports) {
      if (info.before) {
        declarations.push(...info.before);
      }
      if (info.type === "function") {
        if (info.declaration) {
          // If we already have the function declaration from the first pass, use it
          const functionBody = info.declaration.slice(
            info.declaration.indexOf("function")
          );
          declarations.push(`const ${name} = registerServerReference(${functionBody}, "${url}", "${name}");
export { ${name} };`);
        } else {
          // Try to find the function in the original source
          const functionMatch = source.match(
            new RegExp(
              `(?:export\\s+)?(?:async\\s+)?function\\s+${info.localName || name}\\s*\\([^)]*\\)\\s*(?::\\s*[^{]*)?\\s*{[\\s\\S]*?\\n}`
            )
          );
          if (functionMatch) {
            const functionBody = functionMatch[0].slice(
              functionMatch[0].indexOf("function")
            );
            declarations.push(`const ${name} = registerServerReference(${functionBody}, "${url}", "${name}");
export { ${name} };`);
          } else if (isDev) {
            throw new Error(`Function ${name} not found in:\n${source}`);
          } else {
            throw new Error(`Transform failed.`);
          }
        }
      }
      if (info.after) {
        declarations.push(...info.after);
      }
      exportNames.push(name);
    }
  } else if (isClientComponent) {
    // For client modules
    for (const [name, info] of exports) {
      if (info.type === "function") {
        // For client components, we don't keep the original declaration
        // Just collect the name for the reference
        exportNames.push(name);
      } else if (info.type === "variable" && info.localName) {
        declarations.push(`export { ${info.localName} as ${name} };`);
        exportNames.push(name);
      } else if (info.declaration) {
        declarations.push(info.declaration);
        exportNames.push(name);
      }
    }
  } else {
    // For regular modules
    for (const [name, info] of exports) {
      if (info.type === "variable" && info.localName) {
        declarations.push(`export { ${info.localName} as ${name} };`);
      } else if (info.declaration) {
        declarations.push(info.declaration);
      }
      exportNames.push(name);
    }
  }

  return { imports, declarations, exportNames };
}
/**
 * Transforms a module for RSC boundaries.
 * - Server modules: exports are replaced with server references.
 * - Client modules: exports are replaced with client references or errors, depending on environment.
 * - Only the correct references are exported; implementation is never leaked across boundaries.
 *
 * @param source - The original module source code.
 * @param program - The parsed AST.
 * @param isServerEnvironment - True if running in the server loader.
 * @param isServerModule - True if the module is a server module.
 * @param isClientModule - True if the module is a client module.
 * @param url - The module's unique identifier.
 * @param isClientEnvironment - True if running in the client loader.
 * @returns The transformed source code.
 */
export function transformModuleWithPreservedFunctions(
  source: string,
  url: string,
  moduleId: string,
  program: Program,
  sourceMap: RawSourceMap | null,
  isServerFunction: RegExpMatchArray | null,
  isClientComponent: RegExpMatchArray | null
): { source: string; sourceMap: RawSourceMap | null } {
  const { exportNames } = handleExports(
    source,
    url,
    program,
    isServerFunction,
    isClientComponent
  );
  const moduleIdLiteral = JSON.stringify(moduleId);

  if (isClientComponent) {
    if(!exportNames.length) {
      return {
        source: source,
        sourceMap: sourceMap || null,
      }
    }
    // On the server, client components should be replaced with references
    const newSource = [
      `import { registerClientReference } from 'react-server-dom-esm/server${
        isDev ? ".node" : ""
      }';`,
      "",
      // Transform exports
      ...exportNames.map(
        (name) =>
          `export const ${name} = registerClientReference(function() {
          throw new Error("Attempted to call ${name}() from the server but ${name} is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
        }, ${moduleIdLiteral}, ${JSON.stringify(name)});`
      ),
    ].join("\n");
    return {
      source: newSource,
      sourceMap: sourceMap || null,
    };
  }

  // For server modules in server environment
  if (isServerFunction) {
    if(exportNames.length === 0) {
      return {
        source: source,
        sourceMap: sourceMap || null,
      }
    }

    // First add the import
    let newSource = `import { registerServerReference } from 'react-server-dom-esm/server${
      isDev ? ".node" : ""
    }';\n\n`;

    // Split the source into lines to process it
    const lines = source.split('\n');
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      
      // Handle direct exports
      if (line.match(/^export\s+(?:async\s+)?function\s+\w+/)) {
        // Find the end of the function
        let functionBody = line;
        let j = i + 1;
        let braceCount = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
        
        while (j < lines.length && braceCount > 0) {
          functionBody += '\n' + lines[j];
          braceCount += (lines[j].match(/{/g) || []).length - (lines[j].match(/}/g) || []).length;
          j++;
        }
        
        // Extract function name and wrap with registerServerReference
        const functionName = functionBody.match(/function\s+(\w+)/)?.[1];
        if (functionName) {
          const wrappedFunction = functionBody.replace(/^export\s+/, '');
          newSource += `const ${functionName} = registerServerReference(${wrappedFunction}, ${moduleIdLiteral}, ${JSON.stringify(functionName)});
export { ${functionName} };\n\n`;
        }
        i = j;
      }
      // Handle named exports
      else if (line.match(/^export\s+{/)) {
        const names = line.match(/{([^}]*)}/)?.[1].split(',').map(n => n.trim());
        if (names) {
          for (const name of names) {
            // Look for the function declaration
            const functionMatch = source.match(
              new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*(?::\\s*[^{]*)?\\s*{[\\s\\S]*?\\n}`)
            );
            if (functionMatch) {
              const functionBody = functionMatch[0];
              newSource += `const ${name} = registerServerReference(${functionBody}, ${moduleIdLiteral}, ${JSON.stringify(name)});
export { ${name} };\n\n`;
            } else {
              newSource += `export { ${name} };\n`;
            }
          }
        }
        i++;
      }
      // Keep other lines as is
      else {
        newSource += line + '\n';
        i++;
      }
    }

    return {
      source: newSource,
      sourceMap: sourceMap,
    };
  }
  return {
    source,
    sourceMap: sourceMap || null,
  };
}
