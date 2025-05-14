import { resolveOptions } from "../config/resolveOptions.js";
import type { ResolvedUserOptions, StreamPluginOptions } from "../types.js";
import type { Manifest, Plugin } from "vite";
import { transformModuleIfNeeded } from "../loader/react-loader.js";
import { tryManifest } from "../helpers/tryManifest.js";
import { join } from "node:path";
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
let isBuild = true;

export function reactTransformPlugin(options: StreamPluginOptions): Plugin {
  let userOptions: ResolvedUserOptions;
  const resolvedOptionsResult = resolveOptions(options);
  if (resolvedOptionsResult.type === "error") throw resolvedOptionsResult.error;
  userOptions = resolvedOptionsResult.userOptions;

  let staticManifest: Manifest;

  return {
    name: "vite:react-server-transform",
    enforce: "pre", // Run before Vite's transforms
    async config(_config, configEnv) {
      isBuild = configEnv.command !== "serve";
      if (isBuild) {
        const staticManifestResult = await tryManifest({
          root: userOptions.projectRoot,
          ssrManifest: false,
          outDir: join(userOptions.build.outDir, userOptions.build.static),
        });
        if (staticManifestResult.type === "error") {
          throw staticManifestResult.error;
        }
        staticManifest = staticManifestResult.manifest;
      }
    },
    async transform(code, id, options) {
      const ssr = options?.ssr;
      if (!ssr) return null;
      if (!userOptions.autoDiscover.modulePattern(id)) return null;
      if (!code.match('"use client"')) return null;

      const [key, value] = userOptions.normalizer(id);
      if (isBuild) {
        if (staticManifest) {
          if (value in staticManifest) {
            id = userOptions.moduleID(staticManifest[value].file);
          } else {
            const hash = this.emitFile({
              id,
              type: "chunk",
              fileName: key + ".js",
              name: value,
            });
            // get fileName from hash

            const fileName = this.getFileName(hash);
            id = userOptions.moduleID(fileName);
          }
        } else {
          throw new Error(`Client manifest not found.`);
        }
      } else {
        id = join(userOptions.moduleBasePath, value);
      }
      const transformed = await transformModuleIfNeeded(
        code,
        id,
        // Pass null for nextLoad since we don't need module loading in the plugin
        null
      );
      if (!transformed) return null;
      return {
        code: transformed,
        id: id,
        map: null,
      };
    },
  };
}
