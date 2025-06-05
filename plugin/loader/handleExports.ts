import type { Program, Node } from "./types.js";
import type { 
  FunctionDeclaration,  VariableDeclaration,
  VariableDeclarator
} from "acorn";

export interface ExportInfo {
  name: string;
  localName?: string;
  type: "function" | "variable" | "class" | "unknown" | "all";
  node?: Node;
  declaration?: string;
  before?: string[];
  after?: string[];
  isAsync?: boolean;
  loc?: { line: number; column: number };
}

/**
 * Collects and organizes export information from a module.
 *
 * For all modules:
 * - Collects import statements
 * - Collects export names
 * - Collects declarations
 *
 * The actual transformation of exports (like wrapping with registerServerReference)
 * happens in transformModuleWithPreservedFunctions.
 *
 * @param source - The source code of the module
 * @param url - The URL of the module
 * @param program - The parsed AST program
 * @param isServerFunction - Whether this is a server module
 * @param isClientComponent - Whether this is a client module
 * @returns Object containing imports, declarations, and export names
 */
export function handleExports(
  source: string,
  program: Program,
  isServerFunction: boolean | RegExpMatchArray | null,
  isClientComponent: boolean | RegExpMatchArray | null
): {
  imports: string[];
  declarations: string[];
  exportNames: string[];
  exports: Map<string, ExportInfo>;
} {
  const imports: string[] = [];
  const declarations: string[] = [];
  const exportNames: string[] = [];
  const exports = new Map<string, ExportInfo>();

  let lastEnd = 0;
  let currentBefore: string[] = [];
  let foundFirstExport = false;

  // Helper function to get function type
  function getFunctionType(node: Node): "function" | "variable" | "class" | "unknown" {
    if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") {
      return "function";
    }
    if (node.type === "ClassDeclaration") {
      return "class";
    }
    if (node.type === "VariableDeclaration") {
      return "variable";
    }
    return "unknown";
  }

  // Helper function to convert SourceLocation to our format
  function convertLocation(loc: { start: { line: number; column: number } } | null | undefined): { line: number; column: number } | undefined {
    if (!loc?.start) return undefined;
    return {
      line: loc.start.line,
      column: loc.start.column
    };
  }

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
      const importSource = node.source.value as string;
      const isServerImport = importSource.includes(".server.");
      imports.push(source.slice(node.start, node.end));

      // If this is a server import, mark all imported functions as server actions
      if (isServerImport) {
        for (const spec of node.specifiers) {
          if (spec.type === "ImportSpecifier") {
            const localName = spec.local.type === "Identifier" ? spec.local.name : "";
            const importedName = spec.imported.type === "Identifier" ? spec.imported.name : "";
            if (localName && importedName) {
              exports.set(localName, {
                name: localName,
                type: "function",
                localName,
                before: [...currentBefore],
                loc: convertLocation(spec.local.loc)
              });
              exportNames.push(localName);
            }
          }
        }
      }
    } else if (node.type === "ExportAllDeclaration") {
      // For export * from './other', just add the * export
      exports.set("*", {
        name: "*",
        type: "all",
        before: [...currentBefore],
      });
      currentBefore = [];
      exportNames.push("*");
    } else if (node.type === "ExportNamedDeclaration") {
      if (!foundFirstExport) {
        // This is the first export, so all code before it goes into its before array
        foundFirstExport = true;
      }

      if (node.declaration) {
        if (
          node.declaration.type === "FunctionDeclaration" &&
          node.declaration.id
        ) {
          const name = node.declaration.id.name;
          exports.set(name, {
            name,
            type: getFunctionType(node.declaration),
            declaration: source.slice(node.declaration.start, node.declaration.end),
            before: [...currentBefore],
            isAsync: node.declaration.async,
            loc: convertLocation(node.declaration.id.loc)
          });
          exportNames.push(name);
          currentBefore = [];
        } else if (
          node.declaration.type === "ClassDeclaration" &&
          node.declaration.id
        ) {
          const name = node.declaration.id.name;
          exports.set(name, {
            name,
            type: getFunctionType(node.declaration),
            declaration: source.slice(node.declaration.start, node.declaration.end),
            before: [...currentBefore],
            loc: convertLocation(node.declaration.id.loc)
          });
          exportNames.push(name);
          currentBefore = [];
        } else if (node.declaration.type === "VariableDeclaration") {
          for (const decl of node.declaration.declarations) {
            if (decl.id && decl.id.type === "Identifier") {
              const name = decl.id.name;
              const init = decl.init;
              const isFunction = init != null && (
                init.type === "FunctionExpression" ||
                init.type === "ArrowFunctionExpression"
              );
              const isAsync = isFunction && (
                (init.type === "FunctionExpression" && init.async === true) ||
                (init.type === "ArrowFunctionExpression" && init.async === true)
              );
              exports.set(name, {
                name,
                type: isFunction ? "function" : "variable",
                declaration: source.slice(decl.start, decl.end),
                before: [...currentBefore],
                isAsync: isAsync || false,
                loc: convertLocation(decl.id.loc)
              });
              exportNames.push(name);
              currentBefore = [];
            }
          }
        }
      } else if (node.specifiers) {
        // For named exports (export { a, b, c })
        for (const spec of node.specifiers) {
          if (spec.type === "ExportSpecifier") {
            const localName = spec.local.type === "Identifier" ? spec.local.name : "";
            const exportedName = spec.exported.type === "Identifier" ? spec.exported.name : "";
            if (localName && exportedName) {
              // Find the function declaration in the AST
              const functionDecl = program.body.find(
                (node): node is FunctionDeclaration =>
                  node.type === "FunctionDeclaration" &&
                  node.id?.name === localName
              );

              if (functionDecl) {
                exports.set(exportedName, {
                  name: exportedName,
                  type: getFunctionType(functionDecl),
                  localName,
                  declaration: source.slice(functionDecl.start, functionDecl.end),
                  before: [...currentBefore],
                  isAsync: functionDecl.async,
                  loc: convertLocation(functionDecl.id.loc)
                });
                exportNames.push(exportedName);
              } else {
                // If we can't find a function declaration, check if it's a variable declaration
                const varDecl = program.body.find(
                  (node): node is VariableDeclaration =>
                    node.type === "VariableDeclaration" &&
                    node.declarations.some(
                      (decl) =>
                        decl.id.type === "Identifier" &&
                        decl.id.name === localName &&
                        decl.init &&
                        (decl.init.type === "FunctionExpression" ||
                         decl.init.type === "ArrowFunctionExpression")
                    )
                );

                if (varDecl) {
                  const decl = varDecl.declarations.find(
                    (d: VariableDeclarator) => d.id.type === "Identifier" && d.id.name === localName
                  );
                  if (decl && decl.init) {
                    const isAsync = decl.init.type === "FunctionExpression" ? decl.init.async :
                                  decl.init.type === "ArrowFunctionExpression" ? decl.init.async : false;
                    exports.set(exportedName, {
                      name: exportedName,
                      type: "function",
                      localName,
                      declaration: source.slice(decl.start, decl.end),
                      before: [...currentBefore],
                      isAsync,
                      loc: convertLocation(decl.id.loc)
                    });
                    exportNames.push(exportedName);
                  }
                } else {
                  exports.set(exportedName, {
                    name: exportedName,
                    type: "variable",
                    localName,
                    before: [...currentBefore],
                    loc: convertLocation(spec.local.loc)
                  });
                  exportNames.push(exportedName);
                }
              }
            }
          }
        }
      }
    } else if (node.type === "ExportDefaultDeclaration") {
      if (node.declaration && node.declaration.type === "FunctionDeclaration" && node.declaration.id) {
        exports.set("default", {
          name: "default",
          type: getFunctionType(node.declaration),
          localName: node.declaration.id.name, // Capture the function name
          isAsync: node.declaration.async,
          loc: convertLocation(node.declaration.id.loc)
        });
      } else {
        exports.set("default", {
          name: "default",
          type: "unknown",
          before: [...currentBefore]
        });
      }
      currentBefore = []; // Reset for next export
    } else if (
      node.type === "FunctionDeclaration" ||
      node.type === "VariableDeclaration" ||
      node.type === "ClassDeclaration"
    ) {
      // For non-exported declarations:
      // - Keep all declarations for server functions
      // - Remove function declarations for client components
      if (
        isServerFunction ||
        !isClientComponent ||
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
  // Process all exports regardless of environment - the actual transformation
  // happens in transformModuleWithPreservedFunctions
  for (const [name, info] of exports) {
    if (info.before) {
      declarations.push(...info.before);
    }
    if (info.declaration) {
      declarations.push(info.declaration);
    }
    if (info.after) {
      declarations.push(...info.after);
    }
    if (!exportNames.includes(name)) {
      exportNames.push(name);
    }
  }

  return { imports, declarations, exportNames, exports };
}
