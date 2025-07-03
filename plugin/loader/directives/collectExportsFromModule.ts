import { parse } from "../parse.js";
import type { ExportInfo } from "./types.js";
import { getExports } from "./getExports.js";
import { loadClientSource } from "../../helpers/moduleResolver.js";

/**
 * Recursively collects exports from a module that uses export *
 */
export async function collectExportsFromModule(moduleId: string): Promise<ExportInfo[]> {
    const source = await loadClientSource(moduleId);
  
    if (typeof source !== 'string') {
      throw new Error('Expected source to be a string');
    }
  
    // Use our existing parse function
    const { ast } = await parse(source);
    const exports = await getExports(ast);
    
    // Set originalModuleId for local exports, preserve it for re-exports
    return Array.from(exports.exports.values()).map(exp => ({
      ...exp,
      originalModuleId: exp.originalModuleId || moduleId
    }));
  }