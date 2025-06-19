import type { Node } from "acorn";
import { getFunctionLikeName } from "./getFunctionLikeName.js";
import { getQualifiedName } from "./getQualifiedName.js";
import { 
  isNodeWithParent, 
  isVariableDeclarator, 
  isIdentifier,
  isExportNamedDeclaration,
  isExportDefaultDeclaration,
  isMethodDefinition,
  isArrowFunctionExpression,
  isFunctionExpression,
  isFunctionDeclaration,
  isFunctionNode,
  isProperty
} from "./typeGuards.js";

/**
 * Gets the local name of a function node.
 * For function declarations: returns the function's id name
 * For methods: returns the method's key name
 * For variable declarations: returns the variable's id name
 * For anonymous functions: returns the qualified local name
 */
export function getFunctionName(node: Node): string {
  // For function declarations, use the function name
  if (isFunctionDeclaration(node) && node.id) {
    return node.id.name;
  }

  // For function expressions and arrow functions, try to get the name from the parent
  if ((isFunctionExpression(node) || isArrowFunctionExpression(node)) && isNodeWithParent(node)) {
    const parent = node.parent;
    
    // If parent is a variable declarator, use the variable name
    if (isVariableDeclarator(parent) && isIdentifier(parent.id)) {
      return parent.id.name;
    }
    
    // If parent is a method definition, use the method name
    if (isMethodDefinition(parent) && isIdentifier(parent.key)) {
      return parent.key.name;
    }
    
    // If parent is a property, use the property name
    if (isProperty(parent) && isIdentifier(parent.key)) {
      return parent.key.name;
    }
  }

  // For anonymous functions, try to get a name from the parent
  if (isNodeWithParent(node)) {
    const parent = node.parent;
    
    // If parent is a variable declarator, use the variable name
    if (isVariableDeclarator(parent) && isIdentifier(parent.id)) {
      return parent.id.name;
    }
    
    // If parent is a method definition, use the method name
    if (isMethodDefinition(parent) && isIdentifier(parent.key)) {
      return parent.key.name;
    }
    
    // If parent is a property, use the property name
    if (isProperty(parent) && isIdentifier(parent.key)) {
      return parent.key.name;
    }
  }

  // If we can't find a name, try to get a qualified name
  const qualifiedName = getQualifiedName(node);
  return qualifiedName || "anonymous";
} 