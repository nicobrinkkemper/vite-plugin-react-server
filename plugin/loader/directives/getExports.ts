import { collectExports } from "./collectExports.js";
import type { ParsedExports } from "./types.js";
import type { Program } from "acorn";

/**
 * Returns the exports from the given AST (program).
 */
export async function getExports(program: Program): Promise<ParsedExports> {
  const exports = await collectExports(program);
  const exportNames = exports.map(e => e.exportName);
  const exportsMap = new Map();
  
  for (const exp of exports) {
    exportsMap.set(exp.exportName, {
      localName: exp.localName,
      exportName: exp.exportName,
      type: exp.type,
      range: exp.range,
      loc: exp.loc
    });
  }

  return {
    exportNames,
    exports: exportsMap
  };
} 