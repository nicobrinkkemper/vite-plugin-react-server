import { createTransformer } from "./createTransformer.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { isReactServerCondition } from "../config/getCondition.js";
import type { RawSourceMap } from "source-map";
import { getNodeEnv } from "../getNodeEnv.js";
import { parse } from "./parse.js";

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
  const transformer = createTransformer({
    rscLoader,
    isServerEnvironment,
    verbose,
    parseFn: parse
  });

  return transformer(source, moduleId, isServerFunction, isClientComponent);
}
