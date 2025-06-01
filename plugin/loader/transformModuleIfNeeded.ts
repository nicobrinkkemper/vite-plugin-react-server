import { getCondition } from "../config/getCondition.js";
import { transformModuleWithPreservedFunctions } from "./transformModuleWithPreservedFunctions.js";
import { parse } from "./parse.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";

export function transformModuleIfNeeded(
  source: string,
  moduleId: string,
  isServerFunction: boolean | RegExpMatchArray | null = DEFAULT_CONFIG.AUTO_DISCOVER.isServerFunctionCode(source, moduleId),
  isClientComponent: boolean | RegExpMatchArray | null = DEFAULT_CONFIG.AUTO_DISCOVER.isClientComponentCode(source),
  isServerEnvironment = getCondition() === "react-server"
) {
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
    parse(source),
    isServerFunction,
    isClientComponent
  );

  return result
}
