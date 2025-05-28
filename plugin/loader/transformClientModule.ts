import type { Program } from "./moduleParser.js";
import type { RawSourceMap } from "source-map-js";
import {
  parseExportNamesInto,
  transformModuleWithPreservedFunctions,
} from "./moduleParser.js";

export async function transformClientModule(
  source: string,
  url: string,
  moduleId: string,
  isServerFunction: RegExpMatchArray | null,
  isClientComponent: RegExpMatchArray | null,
  ast: Program,
  sourceMap: RawSourceMap | null
): Promise<{
  source: string;
  sourceMap: RawSourceMap | null;
  $$typeof?: symbol;
  $$id?: string;
}> {
  // Extract export names using the same helper
  const exportNames = await parseExportNamesInto(ast.body, url, {
    load: (_url: string, _context: any) => null,
  });

  // If no exports found, return original
  if (exportNames.length === 0) {
    return { source, sourceMap };
  }

  // Use the shared transformation function
  const transformed = transformModuleWithPreservedFunctions(
    source,
    url,
    moduleId,
    ast,
    sourceMap || null,
    isServerFunction,
    isClientComponent
  );

  return { source: transformed.source, sourceMap: sourceMap };
}
