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

      // Handle directive errors (can be downgraded to warnings based on panicThreshold)
      for (const warning of parseResult.directiveInfo.warnings) {
        const shouldDowngradeToWarning = !isProduction && options.panicThreshold === 'none';
          
        if (shouldDowngradeToWarning) {
          // Downgrade error to warning in development when panicThreshold is 'none'
          const [start, end] = warning.range;
          const lines = source.split('\n');
          const startLine = source.slice(0, start).split('\n').length;
          
          console.warn(`Warning: ${warning.message}`);
          
          // Show document preview with line numbers
          const contextLines = 2; // Show 2 lines before and after
          const minLine = Math.max(1, startLine - contextLines);
          const maxLine = Math.min(lines.length, startLine + contextLines);
          
          console.warn('');
          for (let i = minLine; i <= maxLine; i++) {
            const lineNum = i.toString().padStart(3, ' ');
            const isErrorLine = i === startLine;
            const prefix = isErrorLine ? '>' : ' ';
            const line = lines[i - 1] || '';
            
            if (isErrorLine) {
              console.warn(`${prefix} ${lineNum} | ${line}`);
              // Show pointer to the directive
              const lineStart = source.lastIndexOf('\n', start - 1) + 1;
              const columnPos = Math.max(0, start - lineStart);
              const directiveLength = Math.max(1, end - start);
              const pointer = ' '.repeat(7 + columnPos) + '^'.repeat(directiveLength);
              console.warn(`  ${pointer}`);
            } else {
              console.warn(`  ${lineNum} | ${line}`);
            }
          }
          console.warn('');

          if (options.verbose) {
            console.warn(`  range: [${start}, ${end}]`);
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
      panicThreshold: options.panicThreshold || 'none',
    });
  };
};
