import type { LoaderContext } from "../types.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { createSourceMap } from "./sourceMap.js";
import { transformWithAcornLoose } from "./transformWithAcornLoose.js";
import type { RawSourceMap } from "source-map";
import { getNodeEnv } from "../getNodeEnv.js";

export type LoaderResult = {
  source: string;
  map: RawSourceMap | null;
}

export type Loader = {
  (id: string, context?: LoaderContext, nextLoad?: (id: string) => Promise<LoaderResult>): LoaderResult;
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
  source: string,
  defaultId = 'index',
  isServerFunction?: boolean | RegExpMatchArray | null,
  isClientComponent?: boolean | RegExpMatchArray | null,
  rscLoader = DEFAULT_CONFIG.RSC_LOADER[getNodeEnv()],
  isServerEnvironment = true,
  verbose = false
):
  | string
  | ((
      moduleId: string
    ) => Promise<{ source: string; map: RawSourceMap | null }>) {
  // Loader factory mode
  return async (moduleId = defaultId) => {
    const { code, map } = transformWithAcornLoose(
      source,
      moduleId,
      isServerFunction,
      isClientComponent,
      rscLoader,
      isServerEnvironment,
      verbose
    );
    // Use the map from the transformer, or create one if missing
    const sourceMap = map || createSourceMap(code, source, moduleId);
    return {
      source: code,
      map: sourceMap,
    };
  };
}
