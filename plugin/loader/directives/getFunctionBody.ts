import type { Node, BlockStatement } from "acorn";
import { 
  isFunctionDeclaration, 
  isVariableDeclaration, 
  isArrowFunctionExpression, 
  isBlockStatement,
  isMethodDefinition,
  isProperty,
  isFunctionNode
} from "./typeGuards.js";

export function getFunctionBody(node: Node): BlockStatement | null {
  if (isFunctionDeclaration(node)) {
    return isBlockStatement(node.body) ? node.body : null;
  }
  if (isMethodDefinition(node)) {
    return isBlockStatement(node.value.body) ? node.value.body : null;
  }
  if (isProperty(node) && isFunctionNode(node.value)) {
    return isBlockStatement(node.value.body) ? node.value.body : null;
  }
  if (isVariableDeclaration(node)) {
    const init = node.declarations[0]?.init;
    if (init && isArrowFunctionExpression(init)) {
      return isBlockStatement(init.body) ? init.body : null;
    }
  }
  if (isFunctionNode(node)) {
    return isBlockStatement(node.body) ? node.body : null;
  }
  return null;
} 