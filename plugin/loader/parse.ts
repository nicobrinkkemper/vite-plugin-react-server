import * as acorn from "acorn-loose";
import type { Program } from "./types.js";
import { findDirectives } from "./findDirectives.js";
import type { DirectiveInfo } from "./findDirectives.js";

export interface ParseResult {
  program: Program;
  directives: DirectiveInfo;
  sourceMap: {
    url: string | null;
    start: number;
    end: number;
    lines: number;
  };
}

/**
 * Parses source code and handles source maps and directives.
 * Centralizes all directive detection and normalization logic.
 */
export function parse(source: string, verbose: boolean = false): ParseResult {
  const sourceMapInfo = {
    url: null as string | null,
    start: 0,
    end: 0,
    lines: 0
  };

  const comments: Array<{ type: 'Block' | 'Line'; value: string; start: number; end: number }> = [];

  // Parse the transformed code with acorn
  const program = acorn.parse(source, {
    ecmaVersion: "latest" as const,
    sourceType: "module",
    locations: true,
    allowAwaitOutsideFunction: true,
    allowImportExportEverywhere: true,
    allowReturnOutsideFunction: true,
    allowReserved: true,
    onComment: (isBlock, text, start, end, startLoc, endLoc) => {
      // Store comments in our local array
      comments.push({
        type: isBlock ? 'Block' : 'Line',
        value: text,
        start,
        end
      });

      // Check for source map URL in comments
      if (text.startsWith('# sourceMappingURL=') || text.startsWith('@ sourceMappingURL=')) {
        sourceMapInfo.url = text.slice(19);
        sourceMapInfo.start = start;
        sourceMapInfo.end = end;
        if (startLoc && endLoc) {
          sourceMapInfo.lines = endLoc.line - startLoc.line;
        }
      }
    }
  }) as Program;

  // Add comments to program after parsing is complete
  program.comments = comments;

  if (verbose) {
    console.log('[parse] Program:', program);
  }

  // Use the shared directive detection function
  const directives = findDirectives(program);

  if (verbose) {
    console.log('[parse] Directives:', directives);
  }

  return {
    program,
    directives,
    sourceMap: sourceMapInfo
  };
}
