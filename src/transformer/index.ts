import type { Plugin } from "vite";
import { normalizePath } from "vite";
import { DEFAULT_CONFIG } from "../options.js";
import { createRscTransformer } from "./transformer.js";
import type { ViteReactClientTransformOptions } from "./types.js";


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

export function viteReactClientTransformPlugin(
  options?: ViteReactClientTransformOptions
): Plugin {
  if(process.env['NODE_OPTIONS']?.match(/--conditions=react-server/)) {
    console.log('react-server')
  } else {
    throw new Error('react-server condition not found, set NODE_OPTIONS="--conditions react-server"')
  }
  const projectRoot = options?.projectRoot || process.cwd();
  const include = options?.include || DEFAULT_CONFIG.FILE_REGEX;
  const exclude = options?.exclude;
  let transform: any;
  // get the file we are imported from (parent)

  return {
    name: "vite:react-stream-transformer",
    enforce: "pre",

    configResolved(config) {
      transform = createRscTransformer({
        moduleId:
          options?.moduleId ||
          moduleIdDefault({
            projectRoot: projectRoot,
            output: {
              dir: config.build?.outDir ?? DEFAULT_CONFIG.BUILD.server,
            },
            isProduction: config.isProduction,
          }),
      }).transform;
    },

    transform(code: string, id: string, opts) {
      // Skip if file doesn't match patterns
      if (
        !matchPattern(id, include) ||
        (exclude && matchPattern(id, exclude))
      ) {
        return null;
      }

      // Look for use client directive at start of file (no exceptions)
      const directiveMatch =
        code.startsWith('"use client"') || code.startsWith("'use client'");
      if (!directiveMatch) return null;

      // Transform client components
      return transform(code, id, opts);
    },
  };
}

const moduleIdDefault =
  ({
    projectRoot,
    output: _,
    isProduction,
  }: {
    isProduction: boolean;
    projectRoot: string;
    output: { dir: string };
  }) =>
  (moduleId: string) => {
    const normalized = normalizePath(moduleId);
    const noRoot = normalized.startsWith(projectRoot)
      ? normalized.slice(projectRoot.length)
      : normalized;
    if (!isProduction) {
      return noRoot;
    }
    return noRoot.replace(DEFAULT_CONFIG.FILE_REGEX, ".js");
  };

const matchPattern = (
  file: string,
  pattern: string | RegExp | (string | RegExp)[]
) =>
  Array.isArray(pattern)
    ? pattern.some((p) => file.match(p as RegExp))
    : file.match(pattern as RegExp);
