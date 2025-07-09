import { parse } from "../parse.js";
import { analyzeDirectives } from "./analyzeDirectives.js";
import { getExports } from "./getExports.js";
import type { ParsedExports, ParseResult } from "./types.js";
import type { DirectiveOptions } from "../../types.js";

/**
 * Analyzes a module for directives and returns the parse result with directive info.
 */
export async function analyzeModule(
  source: string,
  options?: DirectiveOptions
): Promise<ParseResult> {
  let result =
    typeof options?.loader.parse === "function"
      ? options.loader.parse(source)
      : parse(source);
  if (result instanceof Promise) {
    result = await result;
  }
  if (typeof result === "object" && !("ast" in result)) {
    result = {
      ast: result,
    };
  }
  // Collect exports from the AST first
  const exports: ParsedExports =
    typeof result === "object" && "exports" in result && result.exports
      ? result.exports
      : await getExports(result.ast);

  if (options?.verbose) {
    if (exports && exports.exports.size > 0) {
      console.log(
        "[analyzeModule] exports",
        Array.from(exports.exports.values())
      );
    }
  }

  const directiveInfo = analyzeDirectives(result.ast, source, options);
  if (options?.verbose) {
    if (directiveInfo.warnings.length > 0) {
      console.log("[analyzeModule] warnings", directiveInfo.warnings);
    }
  }
  let { code = source, map, ast, exports: _, ...rest } = result;
  return {
    type: "success",
    ...rest,
    code: code,
    map: map,
    ast: ast,
    exports,
    directiveInfo,
  };
}
