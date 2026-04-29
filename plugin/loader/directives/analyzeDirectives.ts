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
import { createLogger, type Logger } from "vite";

/**
 * Analyzes directives in the given source and AST, returning directiveInfo.
 */
export function analyzeDirectives(
  ast: Program,
  source: string,
  matches?: DirectiveMatches,
  logger?: Logger
): DirectiveInfo;
export function analyzeDirectives(
  ast: Program,
  source: string,
  options?: DirectiveOptions,
  logger?: Logger
): DirectiveInfo;
export function analyzeDirectives(
  ast: Program,
  source: string,
  optionsOrMatches?: DirectiveMatches | DirectiveOptions,
  _logger?: Logger
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
  // Track the end-of-source position of the last consecutive directive
  // prologue we've walked past. The block below uses this as the start of the
  // "is there real code before this node?" range, so a benign "use strict"
  // (or any other prologue directive) sitting above a "use client" doesn't
  // get classified as code-before-directive.
  let lastProloguePos = 0;
  const verbose =
    hasOptions &&
    typeof optionsOrMatches === "object" &&
    "verbose" in optionsOrMatches &&
    optionsOrMatches.verbose;
  const logger =
    hasOptions &&
    typeof optionsOrMatches === "object" &&
    "logger" in optionsOrMatches
      ? optionsOrMatches.logger ?? _logger ?? createLogger()
      : _logger ?? createLogger();
  // Check if this looks like Vite-injected code
  // During build, Vite may prepend imports (e.g., __vitePreload for dynamic imports)
  // before "use client"/"use server" directives
  const isViteInjectedCode =
    source.includes("__vite__createHotContext") ||
    source.includes("import.meta.hot") ||
    source.includes("import.meta.env") ||
    source.includes("/@vite/client") ||
    source.includes("__vitePreload") ||
    source.includes("\0vite/");

  for (const node of ast.body) {
    // Debug logging
    if (verbose) {
      logger.info(
        `[analyzeDirectives] Processing node: ${node.type} start: ${node.start} end: ${node.end}
directive: ${"directive" in node ? node.directive : "none"}
beforeNode: ${node.start! > 0 ? JSON.stringify(source.slice(0, node.start!)).slice(0, 100) : "none"}`
      );
    }

    // Only check for directives in expression statements
    if (node.type === "ExpressionStatement") {
      let directive: string | null = null;
      // Whether this statement is *some* prologue directive (the AST parser
      // sets `node.directive` for any string-literal at the start of a
      // function/program — "use strict", "use asm", "use client", etc.).
      // We use this to skip non-react prologues without flagging them as
      // "real code before the first directive".
      const isDirectivePrologue =
        ("directive" in node && typeof node.directive === "string") ||
        (node.expression.type === "Literal" &&
          typeof node.expression.value === "string" &&
          (node.expression.value === "use server" ||
            node.expression.value === "use client"));
      if (
        "directive" in node &&
        typeof node.directive === "string" &&
        (node.directive === "use server" || node.directive === "use client")
      ) {
        // Only treat React's directives as the file-level intent. Real-world
        // libraries (compiled output of @chakra-ui/react and @ark-ui/react)
        // ship files like:
        //
        //     "use strict";
        //     "use client";
        //     ...
        //
        // The previous logic accepted any prologue directive into `directive`
        // and the fallback below classified everything that wasn't "use server"
        // as "client". The real "use client" then arrived as a *second*
        // directive and tripped the "Cannot have both 'use client' and 'use
        // server'" warning, even though the file's intent is unambiguously
        // client-only. Filtering on the literal text here mirrors the AST
        // literal branch below and lets `"use strict"` (or any non-react
        // prologue) coexist with `"use client"` / `"use server"` cleanly.
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
            logger.info(
              `[analyzeDirectives] Found first directive: ${directive} at range: ${[
                node.start!,
                node.end!,
              ]}`
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
      } else if (!isDirectivePrologue) {
        // This expression statement is not a directive prologue, so mark as
        // non-directive code if we haven't found the first react directive
        // yet. Skipping prologue directives (like "use strict") here ensures
        // they don't push subsequent "use client" / "use server" out of the
        // "before any other code" position they're required to occupy.
        if (!firstDirective) {
          foundNonDirective = true;
          if (verbose) {
            logger.info(
              `[analyzeDirectives] Found non-directive expression before first directive, setting foundNonDirective=true`
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
          logger.info(
            `[analyzeDirectives] Found non-directive node before first directive: ${node.type}, setting foundNonDirective=true`
          );
        }
      }
    }

    // Check if this node is after any comments or non-whitespace content
    // (excluding earlier directive prologues we've already walked through).
    // Only matters if we haven't found the first directive yet.
    if (!firstDirective && node.start! > lastProloguePos) {
      const beforeNode = source.slice(lastProloguePos, node.start!).trim();
      if (beforeNode.length > 0) {
        foundNonDirective = true;
        if (verbose) {
          logger.info(
            `[analyzeDirectives] Found content before first directive: ${JSON.stringify(
              beforeNode.slice(0, 100)
            )}, setting foundNonDirective=true`
          );
        }
      }
    }

    // Track the trailing edge of a continuous run of directive prologues.
    // Once we see real code or our first react directive, this stops moving.
    if (
      node.type === "ExpressionStatement" &&
      "directive" in node &&
      typeof node.directive === "string" &&
      !firstDirective &&
      !foundNonDirective
    ) {
      lastProloguePos = node.end!;
    }
  }

  // Set the first directive as file-level if found
  if (firstDirective) {
    directiveInfo.fileLevel = firstDirective;

    // Check if there was content (including comments) before the directive,
    // skipping past any benign prologue directives (e.g. "use strict") that
    // legitimately precede a "use client" / "use server".
    if (!foundNonDirective && firstDirective.range[0] > lastProloguePos) {
      const beforeDirective = source
        .slice(lastProloguePos, firstDirective.range[0])
        .trim();
      if (beforeDirective.length > 0) {
        foundNonDirective = true;
        if (verbose) {
          logger.info(
            `[analyzeDirectives] Found content before directive: ${JSON.stringify(
              beforeDirective
            )}, setting foundNonDirective=true for directive`
          );
        }
      }
    }

    // Only warn about directive placement if it's not Vite-injected code
    if (foundNonDirective && !isViteInjectedCode) {
      directiveInfo.warnings.push({
        message:
          "File-level directives must be at the top of the file, before any other code",
        range: [firstDirective.range[0], firstDirective.range[1]],
        type: firstDirective.type,
      });
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
