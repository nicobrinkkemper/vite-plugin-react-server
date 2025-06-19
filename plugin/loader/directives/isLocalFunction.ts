import type { Program, Node } from "acorn";
import { 
  isFunctionDeclaration,
  isVariableDeclaration,
  isVariableDeclarator,
  isFunctionExpression,
  isArrowFunctionExpression
} from "./typeGuards.js";

export function isLocalFunction(program: Program, localName: string): boolean {
  // First check for function declarations
  for (const node of program.body) {
    if (isFunctionDeclaration(node) && node.id?.name === localName) {
      return true;
    }
  }

  // Then check for variable declarations with function expressions
  for (const node of program.body) {
    if (isVariableDeclaration(node)) {
      for (const decl of node.declarations) {
        if (isVariableDeclarator(decl) && 
            decl.id.type === "Identifier" && 
            decl.id.name === localName && 
            decl.init && 
            (isFunctionExpression(decl.init) || isArrowFunctionExpression(decl.init))) {
          return true;
        }
      }
    }
  }

  return false;
} 