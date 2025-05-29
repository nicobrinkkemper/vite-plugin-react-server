import { getCondition } from "../config/getCondition.js";
import { transformModuleWithPreservedFunctions } from "./transformModuleWithPreservedFunctions.js";
import { parse } from "./parse.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";

export function transformModuleIfNeeded(
  source: string,
  url: string,
  moduleId: string,
  isServerFunction: boolean | RegExpMatchArray | null = DEFAULT_CONFIG.AUTO_DISCOVER.isServerFunction(source),
  isClientComponent: boolean | RegExpMatchArray | null = DEFAULT_CONFIG.AUTO_DISCOVER.isClientComponent(source),
  isServerEnvironment = getCondition() === "react-server"
) {
  // Parse source and handle source maps
  const ast = parse(source);  

  // Handle environment-specific cases
  if (
    (isServerEnvironment && !isServerFunction && !isClientComponent) ||
    (!isServerEnvironment && isClientComponent)
  ) {
    return source
  }

  const result = transformModuleWithPreservedFunctions(
    source,
    moduleId,
    url,
    ast,
    isServerFunction,
    isClientComponent
  );

  return result
}
