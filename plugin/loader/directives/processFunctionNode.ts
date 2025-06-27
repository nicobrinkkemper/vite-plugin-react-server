import type { Node, BlockStatement, MethodDefinition, Property } from "acorn";
import type { DirectiveMatch, DirectiveInfo } from "./types.js";
import { isMethodDefinition, isProperty, isFunctionNode, isAsyncFunction, isArrowFunctionExpression, isFunctionDeclaration, isFunctionExpression } from "./typeGuards.js";
import { isDirectiveAtStart, getDirectiveValue } from "./utils.js";

function getFunctionTypeDescription(node: Node): string {
  if (isArrowFunctionExpression(node)) {
    return "Arrow function";
  } else if (isMethodDefinition(node)) {
    return "Class method";
  } else if (isFunctionDeclaration(node)) {
    return "Function";
  } else if (isFunctionExpression(node)) {
    return "Function expression";
  } else {
    return "Function";
  }
}

export function processFunctionNode(
  node: Node,
  name: string,
  exportName: string | undefined,
  match: DirectiveMatch,
  directiveInfo: DirectiveInfo
): void {
  if (!isFunctionNode(node)) {
    return;
  }

  let body: BlockStatement | undefined;
  let actualName = name;
  const actualExportName = exportName;

  if (isMethodDefinition(node)) {
    const methodNode = node as MethodDefinition;
    if (methodNode.value && isFunctionNode(methodNode.value) && methodNode.value.body.type === "BlockStatement") {
      body = methodNode.value.body;
      actualName = methodNode.key.type === "Identifier" ? methodNode.key.name : name;
    }
  } else if (isProperty(node)) {
    const propNode = node as Property;
    if (propNode.value && isFunctionNode(propNode.value) && propNode.value.body.type === "BlockStatement") {
      body = propNode.value.body;
      actualName = propNode.key.type === "Identifier" ? propNode.key.name : name;
    }
  } else if (node.body.type === "BlockStatement") {
    body = node.body;
  }

  if (!body) {
    return;
  }

  // Check if directive is at the start of the function body
  const directiveValue = getDirectiveValue(match.type);
  
  if (!isDirectiveAtStart(node, directiveValue)) {
    return;
  }

  // If we have a file-level directive, warn about function-level directives
  if (directiveInfo.fileLevel) {
    directiveInfo.warnings.push({
      message: `'use ${directiveInfo.fileLevel.type}' is already defined at the top of the file, this directive should be removed.`,
      range: match.range,
      type: match.type
    });
    return;
  }

  if (match.type === "server") {
    // Only add function-level server directives if they're at the start of an async function
    if (isAsyncFunction(node)) {
      directiveInfo.functionLevel.push({
        type: "server",
        name: actualName,
        exportName: actualExportName ?? "default",
        range: match.range,
      });
    } else {
      const functionType = getFunctionTypeDescription(node);
      const nameDesc = actualName === "anonymous" ? "" : ` '${actualName}'`;
      directiveInfo.warnings.push({
        message: `${functionType}${nameDesc} with 'use server' directive must be declared as async`,
        range: match.range,
        type: "server"
      });
    }
  } else if (match.type === "client") {
    directiveInfo.warnings.push({
      message: "'use client' directive is only allowed at the top of a file",
      range: match.range,
      type: "client"
    });
  }
} 