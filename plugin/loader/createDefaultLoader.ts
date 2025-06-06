import type { LoaderContext } from "../types.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { createSourceMap, addSourceMap } from "./sourceMap.js";
import { transformWithAcornLoose } from "./transformWithAcornLoose.js";
import type { RawSourceMap } from 'source-map';

export interface LoaderResult {
  source: string;
  map: RawSourceMap | null;
}

export interface Loader {
  (id: string, context?: LoaderContext, nextLoad?: any): LoaderResult;
}

/**
 * Creates a loader function that transforms modules and handles source maps.
 * This function can be used in two ways:
 * 
 * 1. As a direct transformer:
 *    - Takes source code and returns transformed code with source map attached
 *    - Used by transformModuleIfNeeded
 * 
 * 2. As a loader factory:
 *    - Returns a loader function that takes a module ID and returns a LoaderResult
 *    - Used by the plugin to create loaders for different environments
 */
export function createDefaultLoader(
  sourceOrModuleId: string,
  defaultIdOrSource?: string,
  isServerFunction?: boolean | RegExpMatchArray | null,
  isClientComponent?: boolean | RegExpMatchArray | null,
  importPath = DEFAULT_CONFIG.RSC_LOADER.importPath as string,
  registerClientReferenceName = DEFAULT_CONFIG.RSC_LOADER.registerClientReferenceName,
  registerServerReferenceName = DEFAULT_CONFIG.RSC_LOADER.registerServerReferenceName,
  isServerEnvironment = true,
  verbose = false
): string | ((moduleId: string) => Promise<{ source: string; map: RawSourceMap | null }>) {
  if (defaultIdOrSource) {
    // Loader factory mode
    return async (moduleId: string) => {
      const { code, map } = transformWithAcornLoose(
        sourceOrModuleId,
        moduleId,
        isServerFunction,
        isClientComponent,
        importPath,
        registerClientReferenceName,
        registerServerReferenceName,
        isServerEnvironment,
        verbose
      );
      // Use the map from the transformer, or create one if missing
      const sourceMap = map || createSourceMap(code, sourceOrModuleId, moduleId);
      return {
        source: code,
        map: sourceMap
      };
    };
  }

  // Direct transformer mode
  const { code, map } = transformWithAcornLoose(
    sourceOrModuleId,
    defaultIdOrSource || sourceOrModuleId,
    isServerFunction,
    isClientComponent,
    importPath,
    registerClientReferenceName,
    registerServerReferenceName,
    isServerEnvironment,
    verbose
  );
  const sourceMap = map || createSourceMap(code, sourceOrModuleId, defaultIdOrSource || sourceOrModuleId);
  return addSourceMap(code, sourceMap);
}
