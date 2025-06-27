import type { 
  Node, 
  Program, 
  FunctionExpression, 
  ArrowFunctionExpression, 
  FunctionDeclaration, 
  MethodDefinition, 
  PropertyDefinition, 
  Identifier, 
  VariableDeclarator,
  VariableDeclaration,
  ExportNamedDeclaration,
  ExportDefaultDeclaration,
  ClassDeclaration,
  ObjectExpression,
  Property,
  ExpressionStatement,
  BlockStatement,
  Literal,
  ExportSpecifier,
  ClassBody
} from "acorn";

// Add type for nodes with parent
type NodeWithParent = Node & { parent: Node };

export function isProgram(node: Node): node is Program {
  return node.type === "Program";
}

export function isFunctionNode(node: Node): node is FunctionExpression | ArrowFunctionExpression | FunctionDeclaration {
  return node.type === "FunctionExpression" || 
         node.type === "ArrowFunctionExpression" || 
         node.type === "FunctionDeclaration";
}

export function isMethodDefinition(node: Node): node is MethodDefinition {
  return node.type === "MethodDefinition";
}

export function isPropertyDefinition(node: Node): node is PropertyDefinition {
  return node.type === "PropertyDefinition";
}

export function isVariableDeclarator(node: Node): node is VariableDeclarator {
  return node.type === "VariableDeclarator";
}

export function isIdentifier(node: Node): node is Identifier {
  return node.type === "Identifier";
}

export function isVariableDeclaration(node: Node): node is VariableDeclaration {
  return node.type === "VariableDeclaration";
}

export function isExportDeclaration(node: Node): node is ExportNamedDeclaration | ExportDefaultDeclaration {
  return node.type === "ExportNamedDeclaration" || node.type === "ExportDefaultDeclaration";
}

export function isClassDeclaration(node: Node): node is ClassDeclaration {
  return node.type === "ClassDeclaration";
}

export function isObjectExpression(node: Node): node is ObjectExpression {
  return node.type === "ObjectExpression";
}

export function isProperty(node: Node): node is Property {
  return node.type === "Property";
}

export function isFunctionDeclaration(node: Node): node is FunctionDeclaration {
  return node.type === "FunctionDeclaration";
}

export function isBlockStatement(node: Node): node is BlockStatement {
  return node.type === "BlockStatement";
}

export function isExpressionStatement(node: Node): node is ExpressionStatement {
  return node.type === "ExpressionStatement";
}

export function isLiteral(node: Node): node is Literal {
  return node.type === "Literal";
}

export function isStringLiteral(node: Node): node is Literal & { value: string } {
  return isLiteral(node) && typeof node.value === "string";
}

export function isDirective(node: Node): node is ExpressionStatement & { directive: string } {
  if (node.type !== "ExpressionStatement") return false;
  const expr = (node as ExpressionStatement).expression;
  return isStringLiteral(expr) && 
         (expr.value === "use client" || expr.value === "use server");
}

export function canHaveDirective(node: Node): node is ArrowFunctionExpression | FunctionDeclaration | MethodDefinition | FunctionExpression | ArrowFunctionExpression {
  return (
    isFunctionNode(node) ||
    isMethodDefinition(node) ||
    (isProperty(node) && isFunctionNode(node.value))
  );
}

export function isAsyncFunction(node?: Node): boolean {
  return (
    node != null &&
    ((node.type === "FunctionDeclaration" && (node as FunctionDeclaration).async) ||
    (node.type === "FunctionExpression" && (node as FunctionExpression).async) ||
    (node.type === "ArrowFunctionExpression" && (node as ArrowFunctionExpression).async))
  );
}

export function isExportNamedDeclaration(node: Node): node is ExportNamedDeclaration {
  return node.type === "ExportNamedDeclaration";
}

export function isExportDefaultDeclaration(node: Node): node is ExportDefaultDeclaration {
  return node.type === "ExportDefaultDeclaration";
}

export function isExportSpecifier(node: Node): node is ExportSpecifier {
  return node.type === "ExportSpecifier";
}

export function isClassBody(node: Node): node is ClassBody {
  return node.type === "ClassBody";
}

export function isNodeWithParent(node: Node): node is NodeWithParent {
  return 'parent' in node && node.parent !== undefined;
}

export function isArrowFunctionExpression(node: Node): node is ArrowFunctionExpression {
  return node.type === "ArrowFunctionExpression";
}

export function isFunctionExpression(node: Node): node is FunctionExpression {
  return node.type === "FunctionExpression";
}

// Returns true if node is a function-like node with a block body
export function isFunctionLikeWithBlock(node: Node): node is FunctionDeclaration | FunctionExpression | ArrowFunctionExpression | MethodDefinition | Property {
  if (isFunctionNode(node)) {
    return !!node.body && node.body.type === "BlockStatement";
  }
  if (isMethodDefinition(node)) {
    return !!node.value.body && node.value.body.type === "BlockStatement";
  }
  // Handle object method properties
  if (isProperty(node) && isFunctionNode(node.value)) {
    return !!node.value.body && node.value.body.type === "BlockStatement";
  }
  return false;
}

/**
 * Checks if a function node is nested inside another function
 */
export function isNestedFunction(node: Node): boolean {
  if (!isFunctionNode(node) || !isNodeWithParent(node)) {
    return false;
  }
  
  let current = node.parent as Node | undefined;
  while (current) {
    // If we find another function node in the parent chain, this is nested
    if (isFunctionNode(current)) {
      return true;
    }
    // If we find a class method, check if we're nested inside the method
    if (isMethodDefinition(current)) {
      // If the method contains our function, we're nested
      return true;
    }
    current = isNodeWithParent(current) ? current.parent : undefined;
  }
  
  return false;
}

/**
 * Checks if a function node is a class method
 */
export function isClassMethod(node: Node): boolean {
  if (!isFunctionNode(node) || !isNodeWithParent(node)) {
    return false;
  }
  
  // Check if direct parent is a method definition
  return isMethodDefinition(node.parent);
}

/**
 * Checks if a function node is at the top level (not nested or in a class)
 */
export function isTopLevelFunction(node: Node): boolean {
  return isFunctionNode(node) && !isNestedFunction(node) && !isClassMethod(node);
}
