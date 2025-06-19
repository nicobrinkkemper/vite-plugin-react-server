import type { Node, VariableDeclarator } from "acorn";
import { isMethodDefinition, isFunctionDeclaration, isFunctionExpression, isIdentifier, isVariableDeclarator, isArrowFunctionExpression } from "./typeGuards.js";

export function getFunctionLikeName(node: Node): string {
  if (isMethodDefinition(node)) {
    if (isIdentifier(node.key)) return node.key.name;
    return "";
  }
  if (isFunctionDeclaration(node) && node.id) {
    return node.id.name;
  }
  if (isFunctionExpression(node)) {
    // For function expressions, check if they're in a variable declaration
    if (node.parent && isVariableDeclarator(node.parent)) {
      const declarator = node.parent as VariableDeclarator;
      if (isIdentifier(declarator.id)) {
        return declarator.id.name;
      }
    }
    if (node.id) {
      return node.id.name;
    }
  }
  if (isArrowFunctionExpression(node)) {
    // For arrow functions, check if they're in a variable declaration
    if (node.parent && isVariableDeclarator(node.parent)) {
      const declarator = node.parent as VariableDeclarator;
      if (isIdentifier(declarator.id)) {
        return declarator.id.name;
      }
    }
  }
  return "";
} 