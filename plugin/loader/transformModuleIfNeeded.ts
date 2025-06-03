import { getCondition } from "../config/getCondition.js";
import { transformModuleWithPreservedFunctions } from "./transformModuleWithPreservedFunctions.js";
import { parse } from "./parse.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";

// --- React RSC Directive Handling ---
//
// 1. 'use client' at file top:
//    - Pass through code as-is (after removing directive).
//    - Do not transform or register anything.
//    - Required for React client features to work.
//    - See: https://react.dev/reference/rsc/use-client
//
// 2. 'use server' at file top:
//    - Register all exported async functions as server actions.
//    - See: https://react.dev/reference/rsc/use-server
//
// 3. 'use server' at function top:
//    - Register only that async function as a server action.
//    - See: https://react.dev/reference/rsc/use-server
//
// 4. No directive:
//    - Treat as a normal shared or server-only module.
//    - No special registration or transformation.

export function transformModuleIfNeeded(
  source: string,
  moduleId: string,
  isServerFunction: boolean | RegExpMatchArray | null = DEFAULT_CONFIG.AUTO_DISCOVER.isServerFunctionCode(source, moduleId),
  isClientComponent: boolean | RegExpMatchArray | null = DEFAULT_CONFIG.AUTO_DISCOVER.isClientComponentCode(source, moduleId),
  isServerEnvironment = getCondition() === "react-server"
) {
  // Handle environment-specific cases
  if (isServerEnvironment) {
    // In server environment:
    // - Server functions need transformation
    // - Client components need transformation
    // - Other modules can pass through
    if (!isServerFunction && !isClientComponent) {
      return source;
    }
  } else {
    // In client environment:
    // - Only client components should pass through
    // - Server functions should be transformed
    if (isClientComponent) {
      return source;
    }
  }

  try {
    const result = transformModuleWithPreservedFunctions(
      source,
      moduleId,
      parse(source),
      isServerFunction,
      isClientComponent
    );
    console.log("transformModuleIfNeeded", isServerEnvironment, isServerFunction, isClientComponent, result);
    return result;
  } catch (error) {
    // Log the error and rethrow
    console.error(`Error transforming module ${moduleId}:`, error);
    throw error;
  }
}
