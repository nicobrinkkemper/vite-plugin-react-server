import { parse, type ParseResult } from "./parse.js";
import { transformModuleWithPreservedFunctions } from "./transformModuleWithPreservedFunctions.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { getCondition } from "../config/getCondition.js";

/**
 * Transforms a module using acorn-loose for parsing
 */
export function transformWithAcornLoose(
    source: string,
    moduleId: string,
    isServerFunction: boolean | RegExpMatchArray | null = DEFAULT_CONFIG.AUTO_DISCOVER.isServerFunctionCode(source, moduleId),
    isClientComponent: boolean | RegExpMatchArray | null = DEFAULT_CONFIG.AUTO_DISCOVER.isClientComponentCode(source, moduleId),
    importPath = DEFAULT_CONFIG.RSC_LOADER.importPath,
    registerClientReferenceName = DEFAULT_CONFIG.RSC_LOADER.registerClientReferenceName,
    registerServerReferenceName = DEFAULT_CONFIG.RSC_LOADER.registerServerReferenceName,
    isServerEnvironment = getCondition() === "react-server",
    verbose: boolean = false
  ): string {
    const parseResult: ParseResult = parse(source, verbose);
    const { directives, program, sourceMap } = parseResult;

    if (verbose) {
      console.log('[transformWithAcornLoose] functionLevelServerDirectives:', directives.functionLevelServerDirectives);
    }

    // Strict RSC rules
    if (isServerFunction && isClientComponent) {
      throw new Error(
        `Module ${moduleId} cannot be both a server function and a client component.`
      );
    }
    if(!isServerFunction && directives.useServer) {
      throw new Error(
        `Module ${moduleId} contains a 'use server' directive, but it wasn't specified as a server component.`
      );
    }
    if(!isClientComponent && directives.useClient) {
      throw new Error(
        `Module ${moduleId} contains a 'use client' directive, but it wasn't specified as a client component.`
      );
    }
    if (isClientComponent) {
      if (directives.functionLevelClientDirectives && directives.functionLevelClientDirectives.length > 0) {
        throw new Error(
          `Module ${moduleId} contains function-level 'use client' directives, which are not allowed.`
        );
      }
      if (!directives.useClient && !directives.fileLevelClientDirective) {
        throw new Error(
          `Module ${moduleId} is expected to be a client component, but no 'use client' directive was found.`
        );
      }
      
    }
    if (isServerFunction) {
      if (!directives.useServer && !directives.fileLevelServerDirective && !directives.functionLevelServerDirectives.length) {
        throw new Error(
          `Module ${moduleId} is expected to be a server function, but no 'use server' directive was found.`
        );
      }
    }

    if(verbose) {
      console.log('[transformWithAcornLoose]', {
        parseResult
      });
    }
    return transformModuleWithPreservedFunctions(
      source,
      moduleId,
      program,
      directives,
      sourceMap,
      isServerFunction,
      isClientComponent,
      isServerEnvironment,
      importPath,
      registerClientReferenceName,
      registerServerReferenceName,
      verbose
    );
  }