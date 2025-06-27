import { transformModule } from "./transformModule.js";
import { isReactServerCondition } from "../config/getCondition.js";
import { parse } from "./parse.js";
import { analyzeModule } from "./directives/analyzeModule.js";
import { findDirectiveMatches } from "./directives/findDirectiveMatches.js";
import type { DirectiveMatch } from "./directives/types.js";
import type { TransformerFactory, TransformResult } from "./types.js";
import { getNodeEnv } from "../getNodeEnv.js";

/**
 * Creates a transformer that handles React Server Components (RSC) boundaries.
 */
export const createTransformer: TransformerFactory = ({
  parseFn = parse,
  options,
  forceServerFunction = undefined,
  forceClientComponent = undefined,
  isServerEnvironment = isReactServerCondition(),
}) => {
  return async (source: string, moduleId: string): Promise<TransformResult> => {
    if (options.verbose) {
      console.log(`[createTransformer] Loading: ${moduleId}`);
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

    if (isServerEnvironment === false && hasServerDirective) {
      console.warn(
        "You likely don't want to use createTransformer in the client environment."
      );
    }

    // Use analyzeModule to get the full parse result, passing the custom parseFn
    const parseResult = await analyzeModule(source, options, parseFn);
    if (
      parseResult.directiveInfo &&
      parseResult.directiveInfo.warnings.length > 0
    ) {
      const isProduction = getNodeEnv() === "production";

      // Show warnings with source code snippets (hide detailed info in production)
      for (const warning of parseResult.directiveInfo.warnings) {
        const shouldPanic = isProduction || 
          options.panicThreshold === 'all_errors' || 
          options.panicThreshold === 'critical_errors';
          
        if (shouldPanic) {
          // Throw error in production or when panicThreshold requires it
          throw new Error(warning.message);
        } else {
          // Detailed warning with source context in development
          const [start, end] = warning.range;
          let snippet = source.slice(start, end);

          // Normalize snippet to show just the directive (remove trailing semicolon if present)
          snippet = snippet.replace(/;$/, "");

          const startLine = source.slice(0, start).split("\n").length;

          // Show what content is before the directive (if any)
          const beforeDirective = source.slice(0, start);
          const beforeContent = beforeDirective.trim();

          console.warn(`Warning: ${warning.message}`);
          console.warn(`  at line ${startLine}: ${snippet}`);

          if (beforeContent) {
            console.warn(
              `  content before directive: ${JSON.stringify(beforeContent)}`
            );
          } else {
            console.warn(`  (no content before directive)`);
          }

          if (options.verbose) {
            console.warn(`  range: [${start}, ${end}]`);
            console.warn(`  raw before: ${JSON.stringify(beforeDirective)}`);
          }
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
      panicThreshold: options.panicThreshold || false,
    });
  };
};
