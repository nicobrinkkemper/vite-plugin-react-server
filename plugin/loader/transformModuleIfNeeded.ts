import { getCondition } from "../config/getCondition.js";
import { transformWithAcornLoose } from "./transformWithAcornLoose.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { addSourceMap, createSourceMap } from "./sourceMap.js";
import type { RawSourceMap } from 'source-map';


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

/**
 * Transforms a module and returns the transformed code with source map attached.
 * This is used by the loader to transform modules and attach source maps.
 * 
 * @returns The transformed code with source map attached as a URL comment
 */
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
): string {
  try {
    // If no directives are present, return the original code unchanged
    if (!isServerFunction && !isClientComponent) {
      return source;
    }

    // Get transformed code and source map from acorn-loose transformer
    const { code, map } = transformWithAcornLoose(
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
      console.log("[transformModuleIfNeeded] Transformed module:", { code, map });
    }

    // Create a source map that maps the transformed code back to the original source
    const sourceMap: RawSourceMap = map || createSourceMap(code, source, moduleId);

    // Return the transformed code with source map attached as a URL comment
    return addSourceMap(code, sourceMap);
  } catch (error) {
    // Log the error and rethrow
    console.error(`[transformModuleIfNeeded] Error transforming module ${moduleId}:`, error);
    throw error;
  }
}
