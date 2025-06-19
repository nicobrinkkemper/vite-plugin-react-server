import { createTransformer } from "./createTransformer.js";
import type { RawSourceMap } from "source-map";
import { parse } from "./parse.js";
import type { TransformOptions } from "./types.js";

export type TransformWithAcornLooseFn = (
  source: string,
  moduleId: string,
  options: TransformOptions
) => Promise<{ code: string; map: RawSourceMap | null }>;

/**
 * Transforms a module using acorn-loose for parsing.
 * @returns Object containing the transformed code and its source map
 */
export const transformWithAcornLoose: TransformWithAcornLooseFn =
  async function _transformWithAcornLoose(
    source: string,
    moduleId: string,
    options: TransformOptions
  ): Promise<{ code: string; map: RawSourceMap | null }> {
    const transformer = createTransformer({
      parseFn: parse,
      options: {
        loader: options.loader,
        verbose: options.verbose,
      },
      forceServerFunction: options.forceServerFunction,
      forceClientComponent: options.forceClientComponent,
      isServerEnvironment: options.isServerEnvironment,
    });

    return transformer(source, moduleId);
  };
