import { getCondition } from "../config/getCondition.js";
import { transformWithAcornLoose } from "./transformWithAcornLoose.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";

// --- React RSC Directive Handling ---
//
// 1. 'use client' at file top of NON-SERVER environment:
//    - Pass through code as-is (after removing directive).
//    - Do not transform or register anything.
//    - Remove the directive.
//    - See: https://react.dev/reference/rsc/use-client
// 2.  'use client' at file top of SERVER environment:
//    - Remove implementation of client components.
//    - Import registerClientReference.
//    - Register client components as error-throwing functions.
//    - Always a export const ${registrationName} = registerClientReference(...)
//    - See: https://react.dev/reference/rsc/use-client
// 3. 'use server' at file top:
//    - import registerServerReference.
//    - Append registrations to bottom of file.
//    - Register all exported functions as server actions.
//    - Do not re-export, just append to bottom of file registerServerReference(...).
//    - See: https://react.dev/reference/rsc/use-server
//
// 3. 'use server' at function top:
//    - add import registerServerReference.
//    - Register only that/those functions as a server action.
//    - See: https://react.dev/reference/rsc/use-server
//
// 4. No directive or no exported boundary functions
//    - Treat as server-only module.
//    - Do not allow on client, only use client is allowed on client.
//    - No special registration or transformation.

export function transformModuleIfNeeded(
  source: string,
  moduleId: string,
  isServerFunction: boolean | RegExpMatchArray | null = DEFAULT_CONFIG.AUTO_DISCOVER.isServerFunctionCode(source, moduleId),
  isClientComponent: boolean | RegExpMatchArray | null = DEFAULT_CONFIG.AUTO_DISCOVER.isClientComponentCode(source, moduleId),
  isServerEnvironment = getCondition() === "react-server",
  importPath = DEFAULT_CONFIG.RSC_LOADER.importPath as string,
  registerClientReferenceName = DEFAULT_CONFIG.RSC_LOADER.registerClientReferenceName,
  registerServerReferenceName = DEFAULT_CONFIG.RSC_LOADER.registerServerReferenceName,
  verbose = false
) {
  // Handle environment-specific cases
  if (isServerEnvironment) {
    // In server environment:
    // - Server functions need transformation
    // - Client components need transformation
    // - Other modules can pass through
    if (!isServerFunction && !isClientComponent) {
      if(verbose) {
        console.log("[transformModuleIfNeeded] Skipping transformation for module:", moduleId, "because it is not a server function or client component");
      }
      return source;
    }
  } else {
    // In client environment:
    // - Only client components should pass through
    // - Server functions should be transformed
    if (isClientComponent) {
      if(verbose) {
        console.log("[transformModuleIfNeeded] Skipping transformation for module:", moduleId, "because it is a client component on a non-server environment");
      }
      return source;
    }
  }

  // Strict RSC: cannot be both server and client
  if (isServerFunction && isClientComponent) {
    throw new Error(
      `Module ${moduleId} cannot be both a server function and a client component.`
    );
  }

  try {
    const result = transformWithAcornLoose(
      source,
      moduleId,
      isServerFunction,
      isClientComponent,
      importPath,
      registerClientReferenceName,
      registerServerReferenceName,  
      isServerEnvironment,
      verbose
    );
    if(verbose) {
      console.log("[transformModuleIfNeeded] Transformed module:", result);
    }
    return result;
  } catch (error) {
    // Log the error and rethrow
    console.error(`[transformModuleIfNeeded] Error transforming module ${moduleId}:`, error);
    throw error;
  }
}
