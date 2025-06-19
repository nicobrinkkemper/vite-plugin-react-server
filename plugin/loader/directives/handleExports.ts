import { isFunctionDeclaration } from "./typeGuards.js";
import type { Program, DirectiveInfo, ExportInfo, ParsedExports } from "./types.js";
import type {
  FunctionDeclaration,
  VariableDeclaration,
  VariableDeclarator,
} from "acorn";

// Helper function to convert SourceLocation to our format
function convertLocation(
  loc: { start: { line: number; column: number } } | null | undefined
): { line: number; column: number } | undefined {
  if (!loc?.start) return undefined;
  return {
    line: loc.start.line,
    column: loc.start.column,
  };
}

export function handleExports(
  program: Program,
  directives: DirectiveInfo
): ParsedExports {
  const exportNames: string[] = [];
  const exports = new Map<string, ExportInfo>();

  // Process all exports that have server directives
  if (directives.fileLevel?.type === "server") {
    const functionDecl = program.body.find(isFunctionDeclaration);
    if (functionDecl) {
      exports.set(functionDecl.id.name, {
        localName: functionDecl.id.name,
        exportName: "default",
        type: "function",
        isAsync: functionDecl.async,
        loc: convertLocation(functionDecl.id.loc),
        range: [functionDecl.start!, functionDecl.end!]
      });
      exportNames.push(functionDecl.id.name);
    }
  }

  if (directives.functionLevel.length > 0) {
    for (const directive of directives.functionLevel) {
      if (directive.type === "server" && directive.name) {
        // Find the function declaration in the AST
        const functionDecl = program.body.find(
          (node): node is FunctionDeclaration =>
            node.type === "FunctionDeclaration" &&
            node.id?.name === directive.name
        );

        if (functionDecl) {
          exports.set(directive.name, {
            localName: directive.name,
            exportName: directive.exportName ?? 'default',
            type: "function",
            isAsync: functionDecl.async,
            loc: convertLocation(functionDecl.id.loc),
            range: [functionDecl.start!, functionDecl.end!]
          });
          exportNames.push(directive.name);
          continue;
        }

        // If we can't find a function declaration, check if it's a variable declaration
        const varDecl = program.body.find(
          (node): node is VariableDeclaration =>
            node.type === "VariableDeclaration" &&
            node.declarations.some(
              (decl) =>
                decl.id.type === "Identifier" &&
                decl.id.name === directive.name &&
                decl.init &&
                (decl.init.type === "FunctionExpression" ||
                  decl.init.type === "ArrowFunctionExpression")
            )
        );

        if (varDecl) {
          const decl = varDecl.declarations.find(
            (d: VariableDeclarator) =>
              d.id.type === "Identifier" && d.id.name === directive.name
          );
          if (decl && decl.init) {
            const isAsync =
              decl.init.type === "FunctionExpression"
                ? decl.init.async
                : decl.init.type === "ArrowFunctionExpression"
                ? decl.init.async
                : false;
            exports.set(directive.name, {
              localName: directive.name,
              exportName: directive.exportName ?? 'default',
              type: "function",
              isAsync,
              loc: convertLocation(decl.id.loc),
              range: [decl.start!, decl.end!]
            });
            exportNames.push(directive.name);
          }
        }
      }
    }
  }

  if (directives.fileLevel?.type === "client") {
    const functionDecl = program.body.find(isFunctionDeclaration);
    if (functionDecl) {
      exports.set(functionDecl.id.name, {
        localName: functionDecl.id.name,
        exportName: "default",
        type: "function",
        isAsync: functionDecl.async,
        loc: convertLocation(functionDecl.id.loc),
        range: [functionDecl.start!, functionDecl.end!]
      });
      exportNames.push(functionDecl.id.name);
    }
  }

  return { exportNames, exports };
}
