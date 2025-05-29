import * as acorn from "acorn";
import type { Program } from "./types.js";
import * as esbuild from "esbuild";

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

  try {
    // Use esbuild to transform the code
    const result = esbuild.transformSync(source, {
      loader: 'tsx',
      format: 'esm',
      target: 'esnext',
      sourcemap: true,
      sourcefile: id,
    });

    // Parse the transformed code with acorn
    program = acorn.parse(result.code, {
      ecmaVersion: 'latest' as const,
      sourceType: 'module',
      locations: true,
      allowAwaitOutsideFunction: true,
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      allowReserved: true
    }) as Program;

    return {
      source: result.code,
      ast: program,
      map: result.map ? JSON.parse(result.map) : null
    };
  } catch (e) {
    console.warn('[parse] Error parsing source:', e);
    return {
      source,
      ast: {
        type: "Program",
        body: [],
        sourceType: "module",
        start: 0,
        end: source.length,
      },
      map: null
    };
  }
} 