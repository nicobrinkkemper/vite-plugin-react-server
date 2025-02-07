import type { Plugin } from "vite";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { createClientComponentTransformer } from "./transformer-client-components.js";
import type { StreamPluginOptions } from "../types.js";
import { createServerActionTransformer } from "./transformer-server-actions.js";


/**
 * Plugin for transforming React Client Components.
 *
 * Core responsibilities:
 * 1. Detects "use client" directives
 * 2. Transforms client components for RSC boundaries
 * 3. Adds client reference metadata for RSC
 *
 * When a component is marked with "use client", it:
 * - Gets transformed into a client reference
 * - Maintains module ID for RSC boundaries
 * - Preserves class/function behavior
 *
 * @example
 * ```ts
 * export default defineConfig({
 *   plugins: [
 *     viteReactClientTransformPlugin({
 *       projectRoot: process.cwd(),
 *     })
 *   ]
 * });
 * ```
 */

export function reactTransformPlugin(
  options?: StreamPluginOptions
): Plugin {
  if(process.env['NODE_OPTIONS']?.match(/--conditions[= ]react-server/)) {
    console.log('react-server')
  } else {
    console.log(process.env['NODE_OPTIONS'])
    throw new Error('react-server condition not found, set NODE_OPTIONS="--conditions react-server"')
  }
  const projectRoot = options?.projectRoot || process.cwd();
  const includeClient = options?.autoDiscover?.clientComponents || DEFAULT_CONFIG.AUTO_DISCOVER.clientComponents;
  const includeServerFunctions = options?.autoDiscover?.serverFunctions || DEFAULT_CONFIG.AUTO_DISCOVER.serverFunctions;
  let transformClientComponent: any;
  let transformServerAction: any;
  // get the file we are imported from (parent)

  // Track client components
  const clientComponents = new Set<string>();

  return {
    name: "vite:react-stream-transformer",
    enforce: 'post',

    configResolved(config) {
      transformClientComponent = createClientComponentTransformer({
        moduleId:
          options?.moduleId ||
          DEFAULT_CONFIG.MODULE_ID({
            projectRoot: projectRoot,
            output: {
              dir: config.build?.outDir ?? DEFAULT_CONFIG.BUILD.server,
            },
            isProduction: config.isProduction,
          }),
      }).transform;
      transformServerAction = createServerActionTransformer({
        moduleId:
          options?.moduleId ||
          DEFAULT_CONFIG.MODULE_ID({
            projectRoot: projectRoot,
            output: {
              dir: config.build?.outDir ?? DEFAULT_CONFIG.BUILD.server,
            },
            isProduction: config.isProduction,
          }),
      }).transform;
    },

    config(config) {
      // Get existing inputs
      const existingInput = config.build?.rollupOptions?.input || {};
      const currentInputs = typeof existingInput === 'string' ? { default: existingInput } : existingInput;

      // Add client components
      const entries = Array.from(clientComponents).reduce((acc, path) => ({
        ...acc,
        [path.replace(DEFAULT_CONFIG.FILE_REGEX, '')]: path
      }), {});

      console.log('[TransformerPlugin] Merging inputs:', {
        existing: currentInputs,
        clientComponents: entries
      });

      return {
        build: {
          rollupOptions: {
            input: {
              ...currentInputs,
              ...entries
            }
          }
        }
      };
    },

    buildStart() {
      // Reset client components at start of each build
      clientComponents.clear();
    },

    async transform(code: string, id: string) {
      // Check for directives
      const hasClientDirective = code.match(/^["']use client["'];?/);
      if (!hasClientDirective) {
        return null;
      }

      // Track client component and transform
      clientComponents.add(id);
      console.log('[TransformerPlugin] Found client component:', id);
      return transformClientComponent.bind(this)(code, id);
    },

    // Log final client components list
    buildEnd() {
      console.log('[TransformerPlugin] Final client components:', Array.from(clientComponents));
    }
  };
}
