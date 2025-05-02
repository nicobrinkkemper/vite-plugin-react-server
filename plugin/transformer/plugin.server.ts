import { resolveOptions } from "../config/resolveOptions.js";
import type { ResolvedUserOptions, StreamPluginOptions } from "../types.js";
import type { Manifest, Plugin } from "vite";
import { transformModuleIfNeeded } from "../loader/react-loader.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { tryManifest } from "../helpers/tryManifest.js";
import { join, relative } from "node:path";
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

  let clientManifest: Manifest;
  const clientID = (file: string) => "/" + file;

  return {
    name: "vite:react-server-transform",
    enforce: "pre", // Run before Vite's transforms
    async config(_, configEnv) {
      isBuild = configEnv.command !== "serve";
      const clientManifestResult = await tryManifest({
        root: userOptions.projectRoot,
        ssrManifest: false,
        outDir: join(userOptions.build.outDir, userOptions.build.client),
      });
      if (clientManifestResult.type === "error") {
        console.error(clientManifestResult.error);
        throw clientManifestResult.error;
      }
      clientManifest = clientManifestResult.manifest;
    },
    async transform(code, id, options) {
      const ssr = options?.ssr;
      if (!ssr) return null;
      if (!userOptions.autoDiscover.modulePattern(id)) return null;
      if (!code.match('"use client"')) return null;

      if (isBuild) {
        const [key, value] = userOptions.normalizer(id);

        if (clientManifest) {
          if (value in clientManifest) {5
            id = clientID(clientManifest[value].file);
          } else {
            // a client file without the auto-discoverable .client.js suffix
            // emit it anyway
            const hash = this.emitFile({
              id,
              type: "chunk",
              fileName: key + '.js',
              name: value,
            });
            // get fileName from hash
            const fileName = this.getFileName(hash);
            id = clientID(fileName);
          }
        } else {
          throw new Error(`Client manifest not found.`);
        }
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
