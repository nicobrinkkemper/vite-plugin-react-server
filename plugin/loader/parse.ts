import * as acorn from "acorn-loose";
import type { Program } from "./types.js";

/**
 * Parses source code and handles source maps
 */
export function parse(source: string): Program {
  let program: Program;

  // Parse the transformed code with acorn
  program = acorn.parse(source, {
    ecmaVersion: "latest" as const,
    sourceType: "module",
    locations: true,
    allowAwaitOutsideFunction: true,
    allowImportExportEverywhere: true,
    allowReturnOutsideFunction: true,
    allowReserved: true,
  }) as Program;

  return program
}
