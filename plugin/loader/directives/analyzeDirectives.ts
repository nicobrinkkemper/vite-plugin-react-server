import { findDirectiveMatches } from "./findDirectiveMatches.js";
import { isFunctionNode } from "./typeGuards.js";
import { getFunctionBody } from "./getFunctionBody.js";
import { getFunctionName } from "./getFunctionName.js";
import { getExportedName } from "./getExportedName.js";
import { processFunctionNode } from "./processFunctionNode.js";
import {
  isDirectiveAtStart,
  getDirectiveValue,
  matchOverlapsDirective,
} from "./utils.js";
import type {
  DirectiveInfo,
  DirectiveMatch,
  DirectiveMatches,
} from "./types.js";
import type { Node, Program } from "acorn";
import type { DirectiveOptions } from "../../types.js";

/**
 * Analyzes directives in the given source and AST, returning directiveInfo.
 */
export function analyzeDirectives(
  ast: Program,
  source: string,
  matches?: DirectiveMatches
): DirectiveInfo;
export function analyzeDirectives(
  ast: Program,
  source: string,
  options?: DirectiveOptions
): DirectiveInfo;
export function analyzeDirectives(
  ast: Program,
  source: string,
  optionsOrMatches?: DirectiveMatches | DirectiveOptions
): DirectiveInfo {
  const hasOptions =
    optionsOrMatches != null && typeof optionsOrMatches === "object";
  const directiveMatches =
    hasOptions && "matches" in optionsOrMatches
      ? optionsOrMatches
      : findDirectiveMatches(source);

  const directiveInfo: DirectiveInfo = {
    fileLevel: null,
    functionLevel: [],
    warnings: [],
  };

  // Find file-level directives by checking AST
  let foundNonDirective = false;
  let firstDirective: DirectiveMatch | null = null;
  let verbose =
    hasOptions && "verbose" in optionsOrMatches && optionsOrMatches.verbose;

  // Check if this looks like Vite-injected code
  const isViteInjectedCode =
    source.includes("__vite__createHotContext") ||
    source.includes("import.meta.hot") ||
    source.includes("import.meta.env") ||
    source.includes("/@vite/client");

  for (const node of ast.body) {
    // Debug logging
    if (verbose) {
      console.log("[analyzeDirectives] Processing node:", {
        type: node.type,
        start: node.start,
        end: node.end,
        directive: "directive" in node ? node.directive : undefined,
        beforeNode:
          node.start! > 0
            ? JSON.stringify(source.slice(0, node.start!))
            : "none",
        foundNonDirective,
      });
    }

    // Only check for directives in expression statements
    if (node.type === "ExpressionStatement") {
      let directive: string | null = null;
      if ("directive" in node && typeof node.directive === "string") {
        directive = node.directive;
      } else if (
        node.expression.type === "Literal" &&
        typeof node.expression.value === "string" &&
        (node.expression.value === "use server" ||
          node.expression.value === "use client")
      ) {
        directive = node.expression.value;
      }

      if (directive) {
        const getDirectiveType =
          optionsOrMatches != null && "loader" in optionsOrMatches
            ? optionsOrMatches.loader?.getDirectiveType
            : undefined;
        const type =
          getDirectiveType?.(directive) ??
          (directive === "use server" ? "server" : "client");
        if (!firstDirective) {
          firstDirective = { type, range: [node.start!, node.end!] };
          if (verbose) {
            console.log(
              "[analyzeDirectives] Found first directive:",
              directive,
              "at range:",
              [node.start!, node.end!]
            );
          }
        } else {
          directiveInfo.warnings.push({
            message:
              "Cannot have both 'use client' and 'use server' directives in the same file",
            range: [0, 0],
            type: "server",
          });
        }
      } else {
        // This expression statement is not a directive, so mark as non-directive
        // if we haven't found the first directive yet
        if (!firstDirective) {
          foundNonDirective = true;
          if (
            optionsOrMatches != null &&
            "verbose" in optionsOrMatches &&
            optionsOrMatches?.verbose
          ) {
            console.log(
              "[analyzeDirectives] Found non-directive expression before first directive, setting foundNonDirective=true"
            );
          }
        }
      }
    } else {
      // Only mark actual code (not imports/exports) as non-directive
      // if we haven't found the first directive yet
      if (!firstDirective) {
        foundNonDirective = true;
        if (verbose) {
          console.log(
            "[analyzeDirectives] Found non-directive node before first directive:",
            node.type,
            "setting foundNonDirective=true"
          );
        }
      }
    }

    // Check if this node is after any comments or non-whitespace content
    // Only matters if we haven't found the first directive yet
    if (!firstDirective && node.start! > 0) {
      const beforeNode = source.slice(0, node.start!).trim();
      if (beforeNode.length > 0) {
        foundNonDirective = true;
        if (verbose) {
          console.log(
            "[analyzeDirectives] Found content before first directive:",
            JSON.stringify(beforeNode),
            "setting foundNonDirective=true"
          );
        }
      }
    }
  }

  // Set the first directive as file-level if found
  if (firstDirective) {
    directiveInfo.fileLevel = firstDirective;

    // Check if there was content (including comments) before the directive
    if (!foundNonDirective && firstDirective.range[0] > 0) {
      const beforeDirective = source.slice(0, firstDirective.range[0]).trim();
      if (beforeDirective.length > 0) {
        foundNonDirective = true;
        if (verbose) {
          console.log(
            "[analyzeDirectives] Found content before directive:",
            JSON.stringify(beforeDirective),
            "setting foundNonDirective=true for directive"
          );
        }
      }
    }

    // Only warn about directive placement if it's not Vite-injected code
    if (foundNonDirective) {
      if (!isViteInjectedCode) {
        directiveInfo.warnings.push({
          message:
            "File-level directives must be at the top of the file, before any other code",
          range: [firstDirective.range[0], firstDirective.range[1]],
          type: firstDirective.type,
        });
      } else {
        directiveInfo.warnings.push({
          message:
            "The client entry is already a client component module, this directive can be removed.",
          range: [firstDirective.range[0], firstDirective.range[1]],
          type: firstDirective.type,
        });
      }
    }
  }

  // Process function-level directives
  const functionLevelMatches = directiveMatches.matches.filter(
    (match: DirectiveMatch) => {
      // Skip if this match is already used as a file-level directive
      if (
        directiveInfo.fileLevel &&
        match.range[0] === directiveInfo.fileLevel.range[0] &&
        match.range[1] === directiveInfo.fileLevel.range[1]
      ) {
        return false;
      }
      return true;
    }
  );

  const processedFunctions = new Set<string>();

  // First pass: collect all function nodes with their directives
  const functionNodes: Array<{
    node: Node;
    match: DirectiveMatch;
    context: string;
  }> = [];

  // Track context during traversal
  function traverseWithContext(
    node: Node,
    context: { inFunction: boolean; inClass: boolean }
  ) {
    if (isFunctionNode(node)) {
      const body = getFunctionBody(node);
      if (body) {
        // Check if directive is at the start of the function body
        for (const match of functionLevelMatches) {
          const directiveValue = getDirectiveValue(match.type);

          if (isDirectiveAtStart(node, directiveValue)) {
            // Check if the match range corresponds to this specific directive position
            const directiveNode = body.body[0];
            const directiveStart = directiveNode.start!;
            const directiveEnd = directiveNode.end!;

            // Match based on position - the match should overlap with the directive node
            const matchOverlaps = matchOverlapsDirective(
              match.range,
              directiveStart,
              directiveEnd
            );

            if (matchOverlaps) {
              const functionName = getFunctionName(node) || "anonymous";

              // Check for invalid contexts based on traversal context
              if (context.inFunction) {
                const nameDesc =
                  functionName === "anonymous" ? "" : ` '${functionName}'`;
                directiveInfo.warnings.push({
                  message: `Function${nameDesc} with '${directiveValue}' directive cannot be nested inside another function. Directives are only allowed in top-level functions.`,
                  range: match.range,
                  type: match.type,
                });
                return; // Skip this function entirely
              }

              if (context.inClass) {
                const nameDesc =
                  functionName === "anonymous" ? "" : ` '${functionName}'`;
                directiveInfo.warnings.push({
                  message: `Class method${nameDesc} with '${directiveValue}' directive is not supported. Directives are only allowed in top-level functions.`,
                  range: match.range,
                  type: match.type,
                });
                return; // Skip this function entirely
              }

              // Only allow server directives in function-level contexts
              if (match.type === "server") {
                functionNodes.push({
                  node,
                  match,
                  context: context.inFunction
                    ? "nested"
                    : context.inClass
                    ? "class"
                    : "top-level",
                });
              } else {
                // Generate warning for client directives in functions
                directiveInfo.warnings.push({
                  message: "Function-level 'use client' isn't allowed",
                  range: match.range,
                  type: "client",
                });
              }
              break;
            }
          }
        }
      }

      // Continue traversal with updated context (now inside a function)
      traverseChildren(node, { inFunction: true, inClass: context.inClass });
    } else if (
      node.type === "ClassDeclaration" ||
      node.type === "ClassExpression"
    ) {
      // Continue traversal with updated context (now inside a class)
      traverseChildren(node, { inFunction: context.inFunction, inClass: true });
    } else if (node.type === "MethodDefinition") {
      // Method definitions are inside classes
      traverseChildren(node, { inFunction: context.inFunction, inClass: true });
    } else {
      // Continue with same context
      traverseChildren(node, context);
    }
  }

  function traverseChildren(
    node: Node,
    context: { inFunction: boolean; inClass: boolean }
  ) {
    const nodeWithChildren = node as any;
    for (const key in nodeWithChildren) {
      if (
        key === "parent" ||
        key === "start" ||
        key === "end" ||
        key === "loc" ||
        key === "range"
      ) {
        continue;
      }

      const value = nodeWithChildren[key];
      if (value && typeof value === "object") {
        if (Array.isArray(value)) {
          for (const child of value) {
            if (child && typeof child === "object" && child.type) {
              traverseWithContext(child, context);
            }
          }
        } else if (value.type) {
          traverseWithContext(value, context);
        }
      }
    }
  }

  // Start traversal at top level (not in function or class)
  traverseWithContext(ast, { inFunction: false, inClass: false });

  // Second pass: process functions in order
  for (const { node, match } of functionNodes) {
    const name = getFunctionName(node) || "anonymous";
    const exportName = getExportedName(node);
    const functionKey = `${name}-${exportName || ""}-${match.range[0]}`;

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
          type: "server",
        });
      } else if (func.type !== "server") {
        directiveInfo.warnings.push({
          message: `Function-level directives should be 'use server', but got 'use ${func.type}'`,
          range: func.range,
          type: "client",
        });
      } else {
        directiveInfo.warnings.push({
          message: `'use server' is already defined at the top of the file, this directive should be removed.`,
          range: func.range,
          type: "server",
        });
      }
    }
  }

  return directiveInfo;
}
