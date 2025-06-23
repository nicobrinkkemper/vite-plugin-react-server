import { parse as acornParse } from "acorn";
import type { Program } from "./types.js";

/**
 * Parses a module and returns { ast, code, map } to match Rollup's this.parse API.
 */
export async function parse(source: string): Promise<{ ast: Program, code: string, map?: {
  url: string;
  start: number;
  end: number;
  lines: number;
} | null }> {
  let sourceMappingURL: string | null = null;
  let sourceMappingStart = 0;
  let sourceMappingEnd = 0;
  let sourceMappingLines = 0;

  const program = acornParse(source, {
    ecmaVersion: 'latest',
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
    },
    allowAwaitOutsideFunction: true,
    allowImportExportEverywhere: true,
    allowReturnOutsideFunction: true,
    allowReserved: true
  });

  const strippedSource = sourceMappingURL ? 
    source.slice(0, sourceMappingStart) + '\n'.repeat(sourceMappingLines) + source.slice(sourceMappingEnd) : 
    source;
    
  return {
    ast: program,
    code: strippedSource,
    map: sourceMappingURL ? {
      url: sourceMappingURL,
      start: sourceMappingStart,
      end: sourceMappingEnd,
      lines: sourceMappingLines
    } : null
  };
} 