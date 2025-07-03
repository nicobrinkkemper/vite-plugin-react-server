import type {
  AnonymousClassDeclaration,
  AnonymousFunctionDeclaration,
  ClassDeclaration,
  Declaration,
  ExportSpecifier,
  Expression,
  FunctionDeclaration,
  Program,
} from "acorn";
import type { ExportInfo } from "./types.js";
import {
  isArrowFunctionExpression,
  isFunctionExpression,
} from "./typeGuards.js";
import { addLocalExportedNames } from "./addLocalExportedNames.js";

function createExportInfo(
  localName: string,
  exportName: string,
  type: "function" | "class" | "variable" | null,
  range: [number, number],
  originalModuleId?: string
): ExportInfo {
  return {
    localName,
    exportName,
    type,
    range,
    originalModuleId,
  };
}

function handleTypedExport(
  id: { name: string } | null,
  exportName: string,
  type: "function" | "class",
  range: [number, number]
): ExportInfo {
  return createExportInfo(
    id?.name || "anonymous",
    exportName,
    type,
    range
  );
}

function handleDefaultExport(
  declaration:
    | AnonymousFunctionDeclaration
    | FunctionDeclaration
    | AnonymousClassDeclaration
    | ClassDeclaration
    | Expression,
  range: [number, number]
): ExportInfo | null {
  if (declaration.type === "Identifier") {
    return createExportInfo(declaration.name, "default", null, range);
  } else if (declaration.type === "FunctionDeclaration") {
    return handleTypedExport(declaration.id, "default", "function", range);
  } else if (declaration.type === "ClassDeclaration") {
    return handleTypedExport(declaration.id, "default", "class", range);
  } else if (declaration.type === "ArrowFunctionExpression") {
    return handleTypedExport(null, "default", "function", range);
  }
  return null;
}

function handleNamedExport(
  declaration: Declaration | Expression,
  range: [number, number]
): ExportInfo[] {
  const exports: ExportInfo[] = [];

  if (declaration.type === "VariableDeclaration") {
    for (const decl of declaration.declarations) {
      if (decl.init) {
        if (
          isArrowFunctionExpression(decl.init) ||
          isFunctionExpression(decl.init)
        ) {
          if (decl.id.type === "Identifier") {
            exports.push(handleTypedExport(decl.id, decl.id.name, "function", range));
          }
        } else {
          addLocalExportedNames(exports, decl.id, range);
        }
      } else {
        addLocalExportedNames(exports, decl.id, range);
      }
    }
  } else if (declaration.type === "FunctionDeclaration" && declaration.id) {
    exports.push(
      handleTypedExport(declaration.id, declaration.id.name, "function", range)
    );
  } else if (declaration.type === "ClassDeclaration" && declaration.id) {
    exports.push(handleTypedExport(declaration.id, declaration.id.name, "class", range));
  }

  return exports;
}

async function handleReExports(
  specifiers: ExportSpecifier[],
  range: [number, number],
  sourceModuleId?: string
): Promise<ExportInfo[]> {
  const exports: ExportInfo[] = [];

  for (const specifier of specifiers) {
    if (
      specifier.local.type === "Identifier" &&
      specifier.exported.type === "Identifier"
    ) {
      // For re-exports from another module, use exported name for function reference
      // For local exports with aliases, use local name for function reference
      const functionName = sourceModuleId ? specifier.exported.name : specifier.local.name;
      
      exports.push(
        createExportInfo(
          functionName,              // Function reference name
          specifier.exported.name,   // Export name
          "function",
          range,
        )
      );
    }
  }

  return exports;
}

/**
 * Collects all exports from a module, including:
 * - Named exports
 * - Default exports
 * - Re-exports
 * - Object method exports
 * - Class method exports
 * - Export * declarations
 */
export async function collectExports(program: Program): Promise<ExportInfo[]> {
  const exports: ExportInfo[] = [];

  for (const node of program.body) {
    switch (node.type) {
      case "ExportDefaultDeclaration": {
        const exportInfo = handleDefaultExport(node.declaration, [
          node.start,
          node.end,
        ]);
        if (exportInfo) {
          exports.push(exportInfo);
        }
        break;
      }

      case "ExportAllDeclaration":
        // If export * is used, the other file needs to explicitly opt into "use server" too.
        // This matches React's loader behavior - we ignore export * declarations
        break;

      case "ExportNamedDeclaration":
        if (node.declaration) {
          exports.push(
            ...handleNamedExport(node.declaration, [node.start, node.end])
          );
        }
        if (node.specifiers) {
          const sourceModuleId = node.source && typeof node.source.value === "string" 
            ? node.source.value 
            : undefined;
          const reExports = await handleReExports(node.specifiers, [node.start, node.end], sourceModuleId);
          exports.push(...reExports);
        }
        break;
    }
  }

  return exports;
}
