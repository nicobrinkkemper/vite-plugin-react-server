import { transformModule } from "./transformModule.js";
import { isReactServerCondition } from "../config/getCondition.js";
import { analyzeModule } from "./directives/analyzeModule.js";
import { findDirectiveMatches } from "./directives/findDirectiveMatches.js";
import type { DirectiveMatch } from "./directives/types.js";
import type { TransformerFactory, TransformResult } from "./types.js";
import { DEFAULT_LOADER_CONFIG } from "../config/defaults.js";
import { getNodeEnv } from "../config/getNodeEnv.js";
import { createLogger } from "vite";
import pkg from "picocolors";
const { red, underline } = pkg;

/**
 * Creates a transformer that handles React Server Components (RSC) boundaries.
 */
export const createTransformer: TransformerFactory = ({
  options,
  forceServerFunction = undefined,
  forceClientComponent = undefined,
  isServerEnvironment = isReactServerCondition(),
}) => {
  return async (source: string, moduleId: string): Promise<TransformResult> => {
    const {
      verbose,
      logger = createLogger(),
      loader = DEFAULT_LOADER_CONFIG,
    } = options;
    if (verbose) {
      logger.info(`[createTransformer:${isServerEnvironment ? "server" : "client"}] Loading: ${moduleId}`);
    }

    // Fast-path: skip parsing and transformation if no directives are present
    const matches = findDirectiveMatches(source);
    const hasServerDirective = matches.matches.some(
      (m: DirectiveMatch) => m.type === "server"
    );
    const hasClientDirective = matches.matches.some(
      (m: DirectiveMatch) => m.type === "client"
    );

    if (hasClientDirective === false && hasServerDirective === false) {
      return { code: source, map: null };
    }
    // Use analyzeModule to get the full parse result, passing the custom parseFn
    const parseResult = await analyzeModule(source, {
      ...options,
      logger,
      loader: loader,
    });
    if (
      parseResult.directiveInfo &&
      parseResult.directiveInfo.warnings.length > 0
    ) {
      const isProduction = getNodeEnv() === "production";

      // Handle directive errors (can be downgraded to warnings based on panicThreshold)
      for (const warning of parseResult.directiveInfo.warnings) {
        const shouldDowngradeToWarning =
          !isProduction && options.panicThreshold === "none";

        if (shouldDowngradeToWarning) {
          // Downgrade error to warning in development when panicThreshold is 'none'
          const [start, end] = warning.range;
          const lines = source.split("\n");
          const startLine = source.slice(0, start).split("\n").length;

          logger.warn(`Warning: ${warning.message}`);

          // Show document preview with line numbers
          const contextLines = 2; // Show 2 lines before and after
          const minLine = Math.max(1, startLine - contextLines);
          const maxLine = Math.min(lines.length, startLine + contextLines);

          for (let i = minLine; i <= maxLine; i++) {
            const lineNum = i.toString().padStart(3, " ");
            const isErrorLine = i === startLine;
            const prefix = isErrorLine ? ">" : " ";
            const line = lines[i - 1] || "";

            if (isErrorLine) {
              // Highlight the directive text itself using Vite's logger color methods
              const lineStart = source.lastIndexOf("\n", start - 1) + 1;
              const columnPos = Math.max(0, start - lineStart);
              const directiveLength = Math.max(1, end - start);
              
              // Split the line to highlight just the directive
              const beforeDirective = line.slice(0, columnPos);
              const directiveText = line.slice(columnPos, columnPos + directiveLength);
              const afterDirective = line.slice(columnPos + directiveLength);
              
              // Use picocolors for proper semantic coloring that adapts to themes
              logger.warn(`${prefix} ${lineNum} | ${beforeDirective}${red(underline(directiveText))}${afterDirective}`);
            } else if(line.trim() !== "") {
              logger.warn(`  ${lineNum} | ${line}`);
            }
          }
          logger.warn("");

          if (options.verbose) {
            logger.warn(`  range: [${start}, ${end}]`);
          }
        } else {
          // Treat as error (default behavior) - panic and stop compilation
          throw new Error(warning.message);
        }
      }
    }
    if (parseResult.type !== "success") {
      return { code: source, map: null };
    }

    // Transform the module
    return await transformModule(source, moduleId, parseResult, {
      forceServerFunction: forceServerFunction ?? hasServerDirective,
      forceClientComponent: forceClientComponent ?? hasClientDirective,
      isServerEnvironment,
      loader: options.loader,
      directiveWarnings: parseResult.directiveInfo.warnings,
      verbose: options.verbose || false,
      panicThreshold: options.panicThreshold || "none",
    });
  };
};
