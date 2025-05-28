import { transformModuleWithPreservedFunctions } from "./moduleParser.js";
import { parseExportNamesInto } from "./moduleParser.js";
import type { Program } from "./moduleParser.js";
import * as acorn from "acorn-loose";
import type { RawSourceMap } from "source-map-js";

export async function transformServerModule(
  source: string,
  url: string,
  moduleId: string,
  isServerFunction: RegExpMatchArray | null,
  isClientComponent: RegExpMatchArray | null,
  ast?: Program,
  sourceMap?: RawSourceMap | null
) {
  // Use provided AST or parse if not available
  const program =
    ast ||
    (acorn.parse(source, {
      sourceType: "module",
      ecmaVersion: "latest",
    }) as Program);

  const exportNames = await parseExportNamesInto(program.body, url, {
    load: () => null,
  });

  // If no exports, return as is
  if (exportNames.length === 0) {
    return {
      source,
      sourceMap: sourceMap || null,
    };
  }

  // Use the shared transformation function
  return transformModuleWithPreservedFunctions(
    source,
    url,
    moduleId,
    program,
    sourceMap || null,
    isServerFunction,
    isClientComponent
  );
}
