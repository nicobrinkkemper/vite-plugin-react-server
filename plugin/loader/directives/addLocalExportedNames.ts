import type { ExportInfo } from "./types.js";

// Helper: recursively collect exportable names from patterns and classes
export function addLocalExportedNames(exports: ExportInfo[], node: any, parentRange: [number, number]) {
    if (!node) return;
    switch (node.type) {
      case "Identifier":
        exports.push({
          localName: node.name,
          exportName: node.name,
          type: null,
          range: parentRange,
        });
        break;
      case "ClassDeclaration":
        if (node.id) {
          exports.push({
            localName: node.id.name,
            exportName: node.id.name,
            type: "class",
            range: parentRange,
          });
        }
        break;
      case "ObjectPattern":
        for (const prop of node.properties) {
          addLocalExportedNames(exports, prop.value || prop.argument, parentRange);
        }
        break;
      case "ArrayPattern":
        for (const element of node.elements) {
          if (element) addLocalExportedNames(exports, element, parentRange);
        }
        break;
      case "Property":
        addLocalExportedNames(exports, node.value, parentRange);
        break;
      case "AssignmentPattern":
        addLocalExportedNames(exports, node.left, parentRange);
        break;
      case "RestElement":
        addLocalExportedNames(exports, node.argument, parentRange);
        break;
      case "ParenthesizedExpression":
        addLocalExportedNames(exports, node.expression, parentRange);
        break;
    }
  }