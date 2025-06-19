import type { Program } from "acorn";
import type { ExportInfo } from "./types.js";
import {
  isArrowFunctionExpression,
  isFunctionExpression,
} from "./typeGuards.js";
import { collectExportsFromModule } from "./collectExportsFromModule.js";
import { addLocalExportedNames } from "./addLocalExportedNames.js";

function createExportInfo(
  localName: string,
  exportName: string,
  type: "function" | "class" | "variable" | null,
  range: [number, number]
): ExportInfo {
  return {
    localName,
    exportName,
    type,
    range,
  };
}

function handleFunctionExport(
  id: { name: string } | null,
  exportName: string,
  range: [number, number]
): ExportInfo {
  return createExportInfo(
    id?.name || "anonymous",
    exportName,
    "function",
    range
  );
}

function handleClassExport(
  id: { name: string } | null,
  exportName: string,
  range: [number, number]
): ExportInfo {
  return createExportInfo(
    id?.name || "anonymous",
    exportName,
    "class",
    range
  );
}

function handleDefaultExport(
  declaration: any,
  range: [number, number]
): ExportInfo | null {
  if (declaration.type === "Identifier") {
    return createExportInfo(
      declaration.name,
      "default",
      null,
      range
    );
  } else if (declaration.type === "FunctionDeclaration") {
    return handleFunctionExport(
      declaration.id,
      "default",
      range
    );
  } else if (declaration.type === "ClassDeclaration") {
    return handleClassExport(
      declaration.id,
      "default",
      range
    );
  } else if (declaration.type === "ArrowFunctionExpression") {
    return handleFunctionExport(
      null,
      "default",
      range
    );
  }
  return null;
}

function handleNamedExport(
  declaration: any,
  range: [number, number]
): ExportInfo[] {
  const exports: ExportInfo[] = [];

  if (declaration.type === "VariableDeclaration") {
    for (const decl of declaration.declarations) {
      if (decl.init) {
        if (isArrowFunctionExpression(decl.init) || isFunctionExpression(decl.init)) {
          if (decl.id.type === "Identifier") {
            exports.push(handleFunctionExport(
              decl.id,
              decl.id.name,
              range
            ));
          }
        } else {
          addLocalExportedNames(exports, decl.id, range);
        }
      } else {
        addLocalExportedNames(exports, decl.id, range);
      }
    }
  } else if (declaration.type === "FunctionDeclaration" && declaration.id) {
    exports.push(handleFunctionExport(
      declaration.id,
      declaration.id.name,
      range
    ));
  } else if (declaration.type === "ClassDeclaration" && declaration.id) {
    exports.push(handleClassExport(
      declaration.id,
      declaration.id.name,
      range
    ));
  }

  return exports;
}

function handleReExports(
  specifiers: any[],
  range: [number, number]
): ExportInfo[] {
  const exports: ExportInfo[] = [];

  for (const specifier of specifiers) {
    if (
      specifier.local.type === "Identifier" &&
      specifier.exported.type === "Identifier"
    ) {
      exports.push(createExportInfo(
        specifier.local.name,
        specifier.exported.name,
        "function",
        range
      ));
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
export async function collectExports(program: Program, loader?: any): Promise<ExportInfo[]> {
  const exports: ExportInfo[] = [];

  for (const node of program.body) {
    switch (node.type) {
      case "ExportDefaultDeclaration": {
        const exportInfo = handleDefaultExport(node.declaration, [node.start, node.end]);
        if (exportInfo) {
          exports.push(exportInfo);
        }
        break;
      }

      case "ExportAllDeclaration":
        if (typeof node.source.value === 'string' && loader) {
          try {
            const reExports = await collectExportsFromModule(node.source.value, loader);
            exports.push(...reExports);
          } catch (error) {
            console.warn(`Failed to collect exports from ${node.source.value}:`, error);
          }
        }
        break;

      case "ExportNamedDeclaration":
        if (node.declaration) {
          exports.push(...handleNamedExport(node.declaration, [node.start, node.end]));
        }
        if (node.specifiers) {
          exports.push(...handleReExports(node.specifiers, [node.start, node.end]));
        }
        break;
    }
  }

  return exports;
}