import type { Program } from "./types.js";

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
      type: "function" | "class" | "variable" | "default" | "all";
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
    } else if (node.type === "ExportAllDeclaration") {
      // For export * from './other', just add the * export
      exports.set("*", {
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
            before: [...currentBefore], // Copy the current before array
          });
          exportNames.push(name);
          currentBefore = []; // Reset for next export
        } else if (
          node.declaration.type === "ClassDeclaration" &&
          node.declaration.id
        ) {
          const name = node.declaration.id.name;
          exports.set(name, {
            type: "class",
            declaration,
            before: [...currentBefore], // Copy the current before array
          });
          exportNames.push(name);
          currentBefore = []; // Reset for next export
        } else if (node.declaration.type === "VariableDeclaration") {
          for (const decl of node.declaration.declarations) {
            if (decl.id && decl.id.type === "Identifier") {
              const name = decl.id.name;
              exports.set(name, {
                type: "variable",
                declaration,
                before: [...currentBefore], // Copy the current before array
              });
              exportNames.push(name);
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
              // Find the function declaration in the AST
              const functionDecl = program.body.find(
                (node) =>
                  node.type === "FunctionDeclaration" &&
                  node.id?.name === localName
              );
              
              if (functionDecl) {
                exports.set(exportedName, {
                  type: "function",
                  localName,
                  declaration: source.slice(functionDecl.start, functionDecl.end),
                  before: beforeCode,
                });
                exportNames.push(exportedName);
              } else {
                exports.set(exportedName, {
                  type: "variable",
                  localName,
                  before: beforeCode,
                });
                exportNames.push(exportedName);
              }
            }
          }
        }
      }
    } else if (node.type === "ExportDefaultDeclaration") {
      exports.set("default", {
        type: "default",
        before: [...currentBefore], // Copy the current before array
      });
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

  return { imports, declarations, exportNames };
}
