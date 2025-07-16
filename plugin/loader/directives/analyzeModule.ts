import { parse } from "../parse.js";
import { analyzeDirectives } from "./analyzeDirectives.js";
import { getExports } from "./getExports.js";
import type { ParsedExports, ParseResult } from "./types.js";
import type { DirectiveOptions } from "../../types.js";
import { createLogger } from "vite";
import { DEFAULT_LOADER_CONFIG } from "../../config/defaults.js";

/**
 * Analyzes a module for directives and returns the parse result with directive info.
 */
export async function analyzeModule(
  source: string,
  options?: DirectiveOptions
): Promise<ParseResult> {
  const {
    verbose = false,
    logger = createLogger(),
    loader = DEFAULT_LOADER_CONFIG,
  } = options ?? {};
  let result =
    typeof loader.parse === "function"
      ? loader.parse(source)
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

  if (verbose) {
    if (exports && exports.exports.size > 0) {
      logger.info(
        "[analyzeModule] exports:\n" +
          Array.from(exports.exports.values())
            .map((e) => `Name: ${e.exportName} Type: ${e.type} Range: ${e.localName}\n`)
            .join("\n")
      );
    }
  }

  const directiveInfo = analyzeDirectives(result.ast, source, options);
  if (verbose) {
    if (directiveInfo.warnings.length > 0) {
      logger.info("[analyzeModule] warnings:\n" + directiveInfo.warnings.join("\n"));
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
