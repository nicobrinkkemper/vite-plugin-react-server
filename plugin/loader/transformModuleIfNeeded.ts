import { getCondition } from "../config/getCondition.js";
import { transformModuleWithPreservedFunctions } from "./transformModuleWithPreservedFunctions.js";
import { createDefaultLoader, type Loader } from "./createDefaultLoader.js";
import { parse } from "./parse.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";

export function transformModuleIfNeeded(
  source: string,
  url: string,
  moduleId: string,
  isServerFunction: boolean | RegExpMatchArray | null = DEFAULT_CONFIG.AUTO_DISCOVER.isServerFunction(source),
  isClientComponent: boolean | RegExpMatchArray | null = DEFAULT_CONFIG.AUTO_DISCOVER.isClientComponent(source),
  isServerEnvironment = getCondition() === "react-server",
  loader: Loader = createDefaultLoader(source)
) {
  if (!source || source.length === 0) {
    const result = loader(url);
    source = result.source;
  }

  // Parse source and handle source maps
  const { source: parsedSource, ast, map } = parse(source, url);

  // Handle environment-specific cases
  if (
    (isServerEnvironment && !isServerFunction && !isClientComponent) ||
    (!isServerEnvironment && isClientComponent)
  ) {
    return {
      source: parsedSource,
      sourceMap: map,
    };
  }

  const result = transformModuleWithPreservedFunctions(
    parsedSource,
    moduleId,
    url,
    ast,
    map, // Pass source map to transformModuleWithPreservedFunctions
    isServerFunction,
    isClientComponent
  );

  return {
    source: result.source,
    sourceMap: result.map || map, // Use result.sourceMap if available, otherwise use the original map
  };
}
