import { readFileSync } from "fs";
import * as esbuild from "esbuild";
import type { LoaderContext } from "../types.js";
import { transformModuleIfNeeded } from "./transformModuleIfNeeded.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";

export interface LoaderResult {
  source: string;
  map: any | null;
}

export interface Loader {
  (id: string, context?: LoaderContext, nextLoad?: any): LoaderResult;
}

function isTransformedObject(obj: any): obj is { source: string; map?: any } {
  return obj && typeof obj === 'object' && typeof obj.source === 'string';
}

/**
 * Creates a default loader function that either uses provided source or reads from file
 */
export function createDefaultLoader(source?: string): Loader {
  if (typeof source === "string") {
    return function load(id: string): LoaderResult {
      // Use esbuild to transform the code
      const result = esbuild.transformSync(source, {
        loader: "tsx",
        format: "esm",
        target: "esnext",
        sourcemap: true,
        sourcefile: id,
      });
      let map = result.map;
      if (typeof map === 'string') {
        try {
          map = JSON.parse(map);
        } catch (e) {
          // leave as is if parsing fails
        }
      }
      return {
        source: result.code,
        map
      };
    };
  }
  return function load(
    id: string,
    context?: LoaderContext,
    nextLoad?: any
  ): LoaderResult {
    if (!nextLoad) {
      nextLoad = (id: string) => {
        const source = readFileSync(id, "utf-8");
        // Use esbuild to transform the code
        const result = esbuild.transformSync(source, {
          loader: "tsx",
          format: "esm",
          target: "esnext",
          sourcemap: true,
          sourcefile: id,
        });

        // Transform the code for RSC boundaries
        const transformed = transformModuleIfNeeded(
          result.code,
          id,
          null, // isServerFunction
          null, // isClientComponent
          true, // isServerEnvironment
          DEFAULT_CONFIG.RSC_LOADER.importPath,
          DEFAULT_CONFIG.RSC_LOADER.registerClientReferenceName,
          DEFAULT_CONFIG.RSC_LOADER.registerServerReferenceName
        );

        if (isTransformedObject(transformed)) {
          return {
            source: transformed.source,
            map: 'map' in transformed ? transformed.map : null
          };
        } else {
          return {
            source: transformed as string,
            map: null
          };
        }
      };
    }
    const result = nextLoad(id, context);
    return {
      ...result,
      map: "map" in result ? result.map : null,
    };
  };
}
