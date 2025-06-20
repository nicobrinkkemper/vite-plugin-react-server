export { parse } from "./parse.js";
export { analyzeDirectives } from "./analyzeDirectives.js";

import { parse } from "./parse.js";
import { analyzeDirectives } from "./analyzeDirectives.js";
import { getExports } from "./getExports.js";
import type { ParseResult } from "./types.js";
import type { DirectiveOptions } from "../../types.js";

/**
 * Analyzes a module for directives and returns the parse result with directive info.
 */
export async function analyzeModule(
  source: string,
  options: DirectiveOptions
): Promise<ParseResult> {
  const { ast, code } = await parse(source);

  const directiveInfo = analyzeDirectives(ast, source, options);
  if(options.verbose) {
    console.log(directiveInfo);
  }

  // Collect exports from the AST
  const exports = await getExports(ast);

  return {
    type: 'success',
    ast,
    code,
    exports,
    directiveInfo
  };
} 