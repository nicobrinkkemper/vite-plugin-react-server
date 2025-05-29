import { readFileSync } from "fs";
import * as esbuild from "esbuild";
import type { LoaderContext } from "../types.js";

export interface LoaderResult {
  source: string;
  map: any | null;
}

export interface Loader {
  (id: string, context?: LoaderContext, nextLoad?: any): LoaderResult;
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
      return {
        source: result.code,
        map: result.map ? JSON.parse(result.map) : null,
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
        return {
          source: result.code,
          map: result.map ? JSON.parse(result.map) : null,
        };
      };
    }
    const result = nextLoad(id, context);
    return {
      ...result,
      map: "map" in result ? result.map : null,
    };
  };
}
