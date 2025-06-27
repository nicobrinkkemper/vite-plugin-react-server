import { parse } from "../parse.js";
import { analyzeDirectives } from "./analyzeDirectives.js";
import { getExports } from "./getExports.js";
import type { ParseResult, Program } from "./types.js";
import type { DirectiveOptions } from "../../types.js";

/**
 * Analyzes a module for directives and returns the parse result with directive info.
 */
export async function analyzeModule(
  source: string,
  options?: DirectiveOptions,
  parseFn: (source: string) => Promise<{ ast: Program; code: string; map?: any }> = parse
): Promise<ParseResult> {
  const { ast, code } = await parseFn(source);

  const directiveInfo = analyzeDirectives(ast, source, options);
  if(options?.verbose) {
    if(directiveInfo.warnings.length > 0) {
      console.log('[analyzeModule] warnings', directiveInfo.warnings);
    }
  }

  // Collect exports from the AST
  const exports = await getExports(ast);
  if(options?.verbose) {
    if(exports.exports.size > 0) {
      console.log('[analyzeModule] exports', Array.from(exports.exports.values()));
    }
  }

  return {
    type: 'success',
    ast,
    code,
    exports,
    directiveInfo
  };
} 