import { findDirectiveMatches } from "./findDirectiveMatches.js";
import { checkDirectives } from "./checkDirectives.js";
import { traverseNode } from "./traverseNode.js";
import { isAsyncFunction, isFunctionNode } from "./typeGuards.js";
import { getFunctionBody } from "./getFunctionBody.js";
import { getFunctionName } from "./getFunctionName.js";
import { getExportedName } from "./getExportedName.js";
import { processFunctionNode } from "./processFunctionNode.js";
import type { DirectiveInfo, DirectiveMatch, DirectiveMatches } from "./types.js";
import type { Node, FunctionDeclaration, FunctionExpression, ArrowFunctionExpression, MethodDefinition, Property, Program, ExpressionStatement } from "acorn";
import type { DirectiveOptions } from "../../types.js";

/**
 * Analyzes directives in the given source and AST, returning directiveInfo.
 */
export function analyzeDirectives(
  ast: Program, 
  source: string,
  matches: DirectiveMatches,
  options: DirectiveOptions,
  moduleId: string
): DirectiveInfo;
export function analyzeDirectives(
  ast: Program, 
  source: string,
  options: DirectiveOptions,
  moduleId: string
): DirectiveInfo;
export function analyzeDirectives(
  ast: Program, 
  source: string,
  sourceOrMatches: DirectiveMatches | DirectiveOptions,
  optionsOrModuleId?: DirectiveOptions | string,
  moduleId?: string
): DirectiveInfo {
  const directiveMatches = typeof sourceOrMatches === 'object' && 'matches' in sourceOrMatches
    ? sourceOrMatches
    : findDirectiveMatches(source);

  const directiveInfo: DirectiveInfo = {
    fileLevel: null,
    functionLevel: [],
    warnings: []
  };

  // Find file-level directives by checking AST
  let foundNonDirective = false;
  let firstDirective: DirectiveMatch | null = null;
  let hasMultipleDirectives = false;

  for (const node of ast.body) {
    // Check if this node is after any comments
    if (node.start! > 0) {
      const beforeNode = source.slice(0, node.start!);
      if (beforeNode.trim().startsWith("//") || beforeNode.trim().startsWith("/*")) {
        foundNonDirective = true;
      }
    }

    // Only check for directives in expression statements
    if (node.type === "ExpressionStatement") {
      let directive: string | null = null;
      if ("directive" in node && typeof node.directive === "string") {
        directive = node.directive;
      } else if (
        node.expression.type === "Literal" &&
        typeof node.expression.value === "string" &&
        (node.expression.value === "use server" || node.expression.value === "use client")
      ) {
        directive = node.expression.value;
      }

      if (directive) {
        const type = directive === "use server" ? "server" : "client";
        if (!firstDirective) {
          firstDirective = { type, range: [node.start!, node.end!] };
        } else {
          hasMultipleDirectives = true;
          directiveInfo.warnings.push({
            message: "Cannot have both 'use client' and 'use server' directives in the same file",
            range: [0, 0],
            type: "server"
          });
        }
      }
    } else if (node.type !== "ImportDeclaration" && node.type !== "ExportNamedDeclaration" && node.type !== "ExportDefaultDeclaration") {
      // Only mark actual code (not imports/exports) as non-directive
      foundNonDirective = true;
    }
  }

  // Set the first directive as file-level if found
  if (firstDirective) {
    directiveInfo.fileLevel = firstDirective;
    if (foundNonDirective) {
      directiveInfo.warnings.push({
        message: "File-level directives must be at the top of the file, before any other code",
        range: [firstDirective.range[0], firstDirective.range[1]],
        type: firstDirective.type
      });
    }
  }

  // Process function-level directives
  const functionLevelMatches = directiveMatches.matches.filter((match: DirectiveMatch) => {
    // Skip if this match is already used as a file-level directive
    if (directiveInfo.fileLevel && 
        match.range[0] === directiveInfo.fileLevel.range[0] && 
        match.range[1] === directiveInfo.fileLevel.range[1]) {
      return false;
    }
    return true;
  });

  const processedFunctions = new Set<string>();

  // First pass: collect all function nodes with their directives
  const functionNodes: Array<{node: Node, match: DirectiveMatch}> = [];
  traverseNode(ast, (node) => {
    if (!isFunctionNode(node)) return;

    const body = getFunctionBody(node);
    if (!body) return;

    // Check if directive is at the start of the function body
    for (const match of functionLevelMatches) {
      const directiveValue = match.type === "server" ? "use server" : "use client";
      const isAtStart = body.body.length > 0 && 
        body.body[0].type === "ExpressionStatement" &&
        body.body[0].expression.type === "Literal" &&
        body.body[0].expression.value === directiveValue;

      if (isAtStart) {
        functionNodes.push({ node, match });
        break;
      }
    }
  });

  // Second pass: process functions in order
  for (const { node, match } of functionNodes) {
    const name = getFunctionName(node) || "anonymous";
    const exportName = getExportedName(node);
    const functionKey = `${name}-${exportName || ''}-${match.range[0]}`;

    // Skip if we've already processed this function
    if (processedFunctions.has(functionKey)) continue;
    processedFunctions.add(functionKey);

    processFunctionNode(node, name, exportName, match, directiveInfo);
  }

  // Add warnings for mixed server/client directives
  if (directiveInfo.fileLevel && directiveInfo.functionLevel.length > 0) {
    for (const func of directiveInfo.functionLevel) {
      if (directiveInfo.fileLevel.type !== func.type) {
        directiveInfo.warnings.push({
          message: `Cannot have both 'use ${directiveInfo.fileLevel.type}' and 'use ${func.type}' directives in the same file`,
          range: func.range,
          type: "server"
        });
      } else {
        directiveInfo.warnings.push({
          message: `'use ${func.type}' is already defined at the top of the file, this function-level directive should be removed.`,
          range: func.range,
          type: "server"
        });
      }
    }
  }

  return directiveInfo;
} 