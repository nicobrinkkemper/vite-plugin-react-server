import { parse, type ParseResult } from "./parse.js";
import { transformModuleWithPreservedFunctions } from "./transformModuleWithPreservedFunctions.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { isReactServerCondition } from "../config/getCondition.js";
import { stripSourceMap, createSourceMap } from "./sourceMap.js";
import { handleExports } from "./handleExports.js";
import type { RawSourceMap } from "source-map";
import { removeDirectives } from "./removeDirectives.js";
import { getNodeEnv } from "../getNodeEnv.js";

/**
 * Transforms a module using acorn-loose for parsing.
 * @returns Object containing the transformed code and its source map
 */
export function transformWithAcornLoose(
  source: string,
  moduleId: string,
  isServerFunction:
    | boolean
    | RegExpMatchArray
    | null = DEFAULT_CONFIG.AUTO_DISCOVER.isServerFunctionCode(
    source,
    moduleId
  ),
  isClientComponent:
    | boolean
    | RegExpMatchArray
    | null = DEFAULT_CONFIG.AUTO_DISCOVER.isClientComponentCode(
    source,
    moduleId
  ),
  rscLoader = DEFAULT_CONFIG.RSC_LOADER[getNodeEnv()],
  isServerEnvironment = isReactServerCondition(),
  verbose: boolean = false
): { code: string; map: RawSourceMap | null } {
  const parseResult: ParseResult = parse(source, verbose);
  const { directives, program, sourceMap: parsedSourceMap } = parseResult;

  let sourceWithoutMap = source;
  let isClient =
    directives.fileLevelClientDirective ||
    directives.functionLevelClientDirectives.length > 0;
  let isServer =
    directives.fileLevelServerDirective ||
    directives.functionLevelServerDirectives.length > 0 ||
    directives.useServer;
  if (isServer && !isServerFunction) {
    throw new Error(
      `Module ${moduleId} is expected to be a server function, but no 'use server' directive was found.`
    );
  }
  if (isClient && !isClientComponent) {
    throw new Error(
      `Module ${moduleId} is expected to be a client component, but no 'use client' directive was found.`
    );
  }
  if (parsedSourceMap && parsedSourceMap.start > 0) {
    sourceWithoutMap = stripSourceMap(source);
  }

  // Collect all directive ranges to remove
  const allDirectiveRanges = directives.directiveRanges;

  // Debug: Log the ranges and code slices being removed
  if (verbose) {
    console.log("[transformModuleWithPreservedFunctions] Ranges to remove:");
    for (const range of allDirectiveRanges) {
      const slice = sourceWithoutMap.slice(range.start, range.end);
      console.log(
        `  Range [${range.start}, ${range.end}):`,
        JSON.stringify(slice)
      );
    }
  }

  const sourceWithoutDirectives = removeDirectives(
    sourceWithoutMap,
    directives.directiveRanges
  );

  // Get export names and create module ID literal
  const { exportNames, exports } = handleExports(
    sourceWithoutMap,
    program,
    isServerFunction,
    isClientComponent
  );

  // Create source map with ranges to remove
  const generatedSourceMap = createSourceMap(
    sourceWithoutDirectives,
    sourceWithoutMap,
    moduleId,
    allDirectiveRanges
  );

  // Throw if any illegal directive remains as a directive (not just as a string literal)
  // We'll use a regex to check for directive statements at the start of a line (optionally with whitespace)
  const illegalDirectiveRegex = /^\s*['"]use (server|client)['"]?/gm;
  const matches = Array.from(
    sourceWithoutDirectives.matchAll(illegalDirectiveRegex)
  );
  if (matches.length > 0) {
    if (getNodeEnv() !== "production") {
      // Don't throw, just log a warning
      console.error(
        `[react-transform] WARNING: Found remaining directives after supposed removal in module: ${moduleId}`
      );
      matches.forEach((match, idx) => {
        const start = match.index;
        const end = start !== undefined ? start + match[0].length : undefined;
        console.error(
          `  [${idx}] Directive: '${match[0]}' at position ${start} to ${end}`
        );
        const endNum =
          typeof end === "number" ? end : typeof start === "number" ? start : 0;
        if (start !== undefined) {
          const context = sourceWithoutDirectives.slice(
            Math.max(0, start - 20),
            Math.min(sourceWithoutDirectives.length, endNum + 20)
          );
          console.error(`      Context: ...${context}...`);
        }
      });
    } else {
      // ignore it
    }
  }

  // Handle environment-specific cases
  if (isServerEnvironment) {
    if (!exportNames.length && !exports.size) {
      if (verbose) {
        console.log(
          "[transformWithAcornLoose] Skipping transformation for module:",
          moduleId,
          "because it has no exports"
        );
      }
      return { code: sourceWithoutDirectives, map: generatedSourceMap };
    }
    // In server environment:
    // - Server functions need transformation
    // - Client components need transformation
    // - Other modules can pass through
    if (!isServerFunction && !isClientComponent) {
      if (verbose) {
        console.log(
          "[transformModuleIfNeeded] Skipping transformation for module:",
          moduleId,
          "because it is not a server function or client component"
        );
      }
      return { code: sourceWithoutDirectives, map: generatedSourceMap };
    }
  } else {
    // In client environment:
    // - Only client components should pass through
    // - Server functions should be transformed
    if (isClientComponent) {
      if (verbose) {
        console.log(
          "[transformModuleIfNeeded] Skipping transformation for module:",
          moduleId,
          "because it is a client component on a non-server environment"
        );
      }
      return { code: sourceWithoutDirectives, map: generatedSourceMap };
    }
  }

  // Strict RSC: cannot be both server and client
  if (isServerFunction && isClientComponent) {
    throw new Error(
      `Module ${moduleId} cannot be both a server function and a client component.`
    );
  }
  if (verbose) {
    console.log(
      "[transformWithAcornLoose] functionLevelServerDirectives:",
      directives.functionLevelServerDirectives
    );
  }

  // Strict RSC rules
  if (isServerFunction && isClientComponent) {
    throw new Error(
      `Module ${moduleId} cannot be both a server function and a client component.`
    );
  }
  if (!isServerFunction && directives.useServer) {
    throw new Error(
      `Module ${moduleId} contains a 'use server' directive, but it wasn't specified as a server component.`
    );
  }
  if (!isClientComponent && directives.useClient) {
    throw new Error(
      `Module ${moduleId} contains a 'use client' directive, but it wasn't specified as a client component.`
    );
  }

  if (isClientComponent) {
    if (
      directives.functionLevelClientDirectives &&
      directives.functionLevelClientDirectives.length > 0
    ) {
      throw new Error(
        `Module ${moduleId} is a client component but contains function-level 'use client' directives.`
      );
    }
  }

  // Transform the module
  const transformedCode = transformModuleWithPreservedFunctions(
    sourceWithoutDirectives,
    moduleId,
    directives,
    { exportNames, exports },
    isServerFunction,
    isClientComponent,
    isServerEnvironment,
    rscLoader,
    verbose
  );

  return { code: transformedCode, map: generatedSourceMap };
}
