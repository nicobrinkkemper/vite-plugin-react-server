import type { Program, Node } from "acorn";
import type { ExportInfo } from "./types.js";
import { 
  isFunctionNode, 
  isArrowFunctionExpression, 
  isObjectExpression, 
  isProperty,
  isIdentifier,
  isLiteral,
  isMethodDefinition,
  isFunctionDeclaration,
  isFunctionExpression,
  isVariableDeclaration,
  isVariableDeclarator
} from "./typeGuards.js";


/**
 * Gets the export info for a function node
 */
export function getExportInfoForFunction(node: Node, exports: ExportInfo[]): ExportInfo | undefined {
  return exports.find(e => {
    // For class methods, check if the export name matches the method path
    if (isMethodDefinition(node)) {
      const methodName = isIdentifier(node.key) ? node.key.name : 
                       isLiteral(node.key) ? String(node.key.value) : "";
      return e.exportName === `${e.localName}.${methodName}`;
    }
    // For object method properties
    if (isProperty(node) && isFunctionNode(node.value)) {
      const methodName = isIdentifier(node.key) ? node.key.name : 
                       isLiteral(node.key) ? String(node.key.value) : "";
      return e.exportName === `${e.localName}.${methodName}`;
    }
    // For anonymous functions in default exports
    if ((isFunctionExpression(node) || isFunctionDeclaration(node) || isArrowFunctionExpression(node)) && 
        node.parent?.type === "ExportDefaultDeclaration") {
      return e.exportName === "default";
    }
    // For all other functions, check if the node is contained within the export's range
    // or if the function name matches the export name
    if (isFunctionDeclaration(node) && node.id) {
      return node.id.name === e.localName || node.id.name === e.exportName;
    }
    return node.start >= e.range[0] && node.end <= e.range[1];
  });
}

/**
 * Gets the export name for a function node
 */
export function getExportNameForFunction(node: Node, exports: ExportInfo[]): string | undefined {
  const exportInfo = getExportInfoForFunction(node, exports);
  return exportInfo?.exportName;
}

/**
 * Gets the local name for a function node
 */
export function getLocalNameForFunction(node: Node, exports: ExportInfo[]): string | undefined {
  const exportInfo = getExportInfoForFunction(node, exports);
  return exportInfo?.localName;
} 