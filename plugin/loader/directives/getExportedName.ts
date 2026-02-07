import type { Node, FunctionDeclaration, FunctionExpression, MethodDefinition, PropertyDefinition, VariableDeclarator, ClassBody, ClassDeclaration } from "acorn";

export function getExportedName(node: Node): string | undefined {
  // If not in export map, try to get the name based on node type
  if (node.type === "FunctionDeclaration") {
    const funcDecl = node as FunctionDeclaration;
    return funcDecl.id?.name;
  } else if (node.type === "FunctionExpression") {
    const funcExpr = node as FunctionExpression;
    // For anonymous functions in default exports, use "default"
    if (funcExpr.parent?.type === "ExportDefaultDeclaration") {
      return "default";
    }
    // For other anonymous functions, try to get the name from the parent
    if (funcExpr.parent?.type === "VariableDeclarator") {
      const varDecl = funcExpr.parent as VariableDeclarator;
      return varDecl.id.type === "Identifier" ? varDecl.id.name : undefined;
    }
    return undefined;
  } else if (node.type === "MethodDefinition") {
    const method = node as MethodDefinition;
    const methodName =
      method.key.type === "Identifier"
        ? method.key.name
        : method.key.type === "Literal" &&
          typeof method.key.value === "string"
        ? method.key.value
        : undefined;
    if (methodName) {
      // Get the class name from the parent
      const classBody = method.parent as ClassBody;
      const classDecl = classBody.parent as ClassDeclaration;
      const className = classDecl.id?.name;
      if (className) {
        return method.static
          ? `${className}.${methodName}`
          : `${className}.prototype.${methodName}`;
      }
      return methodName;
    }
  } else if (node.type === "Property") {
    const prop = node as PropertyDefinition;
    const propName =
      prop.key.type === "Identifier"
        ? prop.key.name
        : prop.key.type === "Literal" && typeof prop.key.value === "string"
        ? prop.key.value
        : undefined;
    if (propName) {
      // Get the full path for nested objects
      let current = prop.parent;
      let path = propName;
      while (current && current.type === "Property") {
        const parentProp = current as PropertyDefinition;
        const parentName = parentProp.key.type === "Identifier" ? parentProp.key.name :
                         parentProp.key.type === "Literal" ? String(parentProp.key.value) : "";
        if (parentName) {
          path = `${parentName}.${path}`;
        }
        current = current.parent;
      }
      // If this is part of an exported object, add the export name
      if (current?.type === "VariableDeclarator") {
        const varDecl = current as VariableDeclarator;
        if (varDecl.id.type === "Identifier") {
          path = `${varDecl.id.name}.${path}`;
        }
      }
      return path;
    }
  }
  return undefined;
} 