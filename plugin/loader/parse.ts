import * as acorn from "acorn-loose";
import type { Program } from "./types.js";
import { createBasicSourceMap } from "./sourceMap.js";

export interface LoaderResult {
  source: string;
  ast: Program;
  map: any | null;
}

/**
 * Parses source code and handles source maps
 */
export function parse(source: string, id?: string): LoaderResult {
  let program: Program;
  let sourceMappingURL = null;
  let sourceMappingStart = 0;
  let sourceMappingEnd = 0;
  let sourceMappingLines = 0;

  try {
    // Parse with acorn to get AST and detect source map comments
    program = acorn.parse(source, {
      ecmaVersion: 'latest' as const,
      sourceType: 'module',
      locations: true,
      onComment(_block, text, start, end, startLoc, endLoc) {
        if (text.startsWith('# sourceMappingURL=') || text.startsWith('@ sourceMappingURL=')) {
          sourceMappingURL = text.slice(19);
          sourceMappingStart = start;
          sourceMappingEnd = end;
          if (startLoc && endLoc) {
            sourceMappingLines = endLoc.line - startLoc.line;
          }
        }
      }
    }) as Program;
  } catch (e) {
    console.warn('[parse] Error parsing source:', e);
    return { 
      source,
      ast: acorn.parse(source, { sourceType: "module", ecmaVersion: "latest" }) as Program,
      map: null
    };
  }

  // If we found a source map comment, strip it
  if (sourceMappingURL) {
    source = source.slice(0, sourceMappingStart) + '\n'.repeat(sourceMappingLines) + source.slice(sourceMappingEnd);
  }

  // Always create a basic source map
  return {
    source,
    ast: program,
    map: createBasicSourceMap(id || '', source)
  };
} 