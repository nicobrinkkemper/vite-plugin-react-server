import { transformModule } from "./transformModule.js";
import { isReactServerCondition } from "../config/getCondition.js";
import { parse } from "./parse.js";
import type {
  DirectiveWarning,
  DirectiveMatch,
} from "./directives/types.js";
import { analyzeDirectives } from "./directives/analyzeDirectives.js";
import { getExports } from "./directives/getExports.js";
import { findDirectiveMatches } from "./directives/findDirectiveMatches.js";
import type { TransformerFactory, TransformResult } from "./types.js";

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

    // Validate flags against matches
    const hasServerDirective = matches.matches.some((m: DirectiveMatch) => m.type === "server");
    const hasClientDirective = matches.matches.some((m: DirectiveMatch) => m.type === "client");

    if (hasClientDirective === false && hasServerDirective === false) {
      return { code: source, map: null };
    }
    if(isServerEnvironment === false && hasServerDirective) {
      console.warn('You likely don\'t want to use createTransformer in the client environment.');
    }
    const warnings: DirectiveWarning[] = [];

    // Parse the module to get AST, code, and map
    const { ast, code, map } = await parseFn(source, options.verbose);
    const exports = await getExports(ast);
    const directiveInfo = analyzeDirectives(ast, source, {
      loader: options.loader,
      verbose: options.verbose
    });

    // Handle directive removal
    const transformedSource = source;
    
    if(warnings.length > 0) {
      // throw first warning as error
      const error = new Error(warnings[0].message);
      Error.captureStackTrace(error, createTransformer);
      throw error;
    }

    // Transform the module
    const transformedCode = await transformModule(
      transformedSource,
      moduleId,
      {
        type: "success",
        ast,
        code,
        map,
        exports,
        directiveInfo,
      },
      {
        forceServerFunction: forceServerFunction ?? hasServerDirective,
        forceClientComponent: forceClientComponent ?? hasClientDirective,
        isServerEnvironment,
        loader: options.loader,
        directiveWarnings: warnings,
        verbose: options.verbose || false,
      }
    );
    return {
      code: transformedCode.code,
      map: transformedCode.map || null,
    };
  };
};
