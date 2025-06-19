import { parse } from "./parse.js";
import type { ExportInfo } from "./types.js";
import { getExports } from "./getExports.js";

/**
 * Recursively collects exports from a module that uses export *
 */
export async function collectExportsFromModule(moduleId: string, loader: any): Promise<ExportInfo[]> {
    const result = await loader(moduleId, {
      format: 'module',
      conditions: ['react-server'],
    }, loader);
  
    if (typeof result.source !== 'string') {
      throw new Error('Expected source to be a string');
    }
  
    // Use our existing parse function
    const { ast } = await parse(result.source);
    const exports = await getExports(ast);
    return Array.from(exports.exports.values());
  }