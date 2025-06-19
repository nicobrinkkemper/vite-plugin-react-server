import { transformWithAcornLoose } from "./transformWithAcornLoose.js";
import type { RawSourceMap } from "source-map";
import type { TransformOptions } from "./types.js";


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
export async function transformModuleIfNeeded(
  source: string,
  moduleId: string,
  options: TransformOptions
): Promise<{ code: string; map: RawSourceMap | null }> {
  try {
    // Get transformed code and source map from acorn-loose transformer
    const result = await transformWithAcornLoose(
      source,
      moduleId,
      options
    );

    if(options.verbose) {
      console.log("[transformModuleIfNeeded] Transformed module:", { code: result.code, map: result.map });
    }
    // Return the transformed code with source map attached as a URL comment
    return result;
  } catch (error) {
    // Log the error and rethrow
    console.error(`[transformModuleIfNeeded] Error transforming module ${moduleId}:`, error);
    throw error;
  }
}
