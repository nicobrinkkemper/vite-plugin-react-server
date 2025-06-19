import type { Node } from "acorn";
import { 
  isFunctionDeclaration, 
  isMethodDefinition, 
  isVariableDeclarator,
  isClassDeclaration,
  isObjectExpression,
  isIdentifier,
  isClassBody,
  isNodeWithParent,
  isFunctionNode,
  isExportNamedDeclaration,
  isExportDefaultDeclaration
} from "./typeGuards.js";

export function getQualifiedName(node: Node): string {
  const parts: string[] = [];
  let current: Node | undefined = node;

  while (current) {
    if (isFunctionDeclaration(current)) {
      if (current.id) {
        parts.unshift(current.id.name);
      } else if (isNodeWithParent(current) && current.parent) {
        // For anonymous function declarations, try to find a name from the parent
        if (isExportNamedDeclaration(current.parent)) {
          parts.unshift("default");
        } else if (isExportDefaultDeclaration(current.parent)) {
          parts.unshift("default");
        } else if (isVariableDeclarator(current.parent) && isIdentifier(current.parent.id)) {
          parts.unshift(current.parent.id.name);
        }
      }
      break;
    }
    if (isMethodDefinition(current)) {
      parts.unshift(current.key.type === "Identifier" ? current.key.name : "method");
      // Look for the containing object/class name
      if (isNodeWithParent(current) && current.parent) {
        if (isClassBody(current.parent)) {
          const classDecl = current.parent.parent;
          if (classDecl && isClassDeclaration(classDecl) && classDecl.id) {
            parts.unshift(classDecl.id.name);
          }
        } else if (isObjectExpression(current.parent)) {
          // For object methods, try to find the variable name
          let objNode: Node = current.parent;
          while (isNodeWithParent(objNode) && objNode.parent) {
            if (isVariableDeclarator(objNode.parent) && isIdentifier(objNode.parent.id)) {
              parts.unshift(objNode.parent.id.name);
              break;
            }
            objNode = objNode.parent;
          }
        }
      }
      break;
    }
    if (isVariableDeclarator(current) && isIdentifier(current.id)) {
      parts.unshift(current.id.name);
      break;
    }
    if (isFunctionNode(current)) {
      // For anonymous functions, try to find a name from the parent
      if (isNodeWithParent(current) && current.parent) {
        if (isVariableDeclarator(current.parent) && isIdentifier(current.parent.id)) {
          parts.unshift(current.parent.id.name);
          break;
        }
      }
    }
    current = isNodeWithParent(current) ? current.parent : undefined;
  }

  return parts.length > 0 ? parts.join(".") : "anonymous";
} 