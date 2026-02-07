import type { LoaderContext } from "../types.js";
import type { RawSourceMap } from "source-map";
import type { LoadFnOutput, LoadHookContext } from "node:module";
import type { LoadHook } from "node:module";
import { transformWithEsbuild } from "vite";
import { readFile } from "node:fs/promises";

export type LoaderResult = {
  source: string;
  map: RawSourceMap | null;
};

export type Loader = {
  (
    id: string,
    context?: LoaderContext,
    nextLoad?: (id: string) => Promise<LoaderResult>
  ): LoaderResult;
};


const defaultNextLoad: Parameters<LoadHook>[2] = async (url) => {
  const result = await transformWithEsbuild(await readFile(url, "utf-8"), url, {
    loader: "tsx",
    format: "esm",
    sourcemap: "external",
  });
  return {
    source: result.code,
    format: "module",
    map: result.map,
  };
};

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
  defaultSource: string,
  defaultId = "index",
): (
  url: string,
  context?: Partial<LoadHookContext>,
  nextLoad?: (
    url: string,
    context?: Partial<LoadHookContext>
  ) => LoadFnOutput | Promise<LoadFnOutput>
) => Promise<LoadFnOutput> {

  const defaultSourceNextLoad: Parameters<LoadHook>[2] =
    typeof defaultSource === "string"
      ? async (url = defaultId) => {
          const result = await transformWithEsbuild(defaultSource, url, {
            loader: "tsx",
            format: "esm",
            sourcemap: "external",
          });
          return {
            source: result.code,
            format: "module",
            map: result.map,
          };
        }
      : defaultNextLoad;

  return async (
    url = defaultId,
    context = {
      format: "module",
      conditions: ["react-server"],
      importAttributes: {},
    },
    nextLoad = defaultSourceNextLoad
  ) => {

    const { format } = context;
    if (format === "module" || format === "module-typescript") {

      const result = await nextLoad(url, context);

      const source =
        typeof result.source === "string"
          ? result.source
          : result.source instanceof Uint8Array ||
            result.source instanceof ArrayBuffer ||
            result.source instanceof Uint8ClampedArray ||
            result.source instanceof Uint16Array ||
            result.source instanceof Uint32Array ||
            result.source instanceof Int8Array ||
            result.source instanceof Int16Array ||
            result.source instanceof Int32Array ||
            result.source instanceof Float32Array ||
            result.source instanceof Float64Array ||
            result.source instanceof BigUint64Array ||
            result.source instanceof BigInt64Array
          ? new TextDecoder().decode(result.source)
          : defaultSource;


      return {
        ...result,
        source: source,
      };
    }

    return nextLoad(url, context);
  };
}
