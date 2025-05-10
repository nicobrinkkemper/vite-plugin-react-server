import { resolveOptions } from "../config/resolveOptions.js";
import type { ResolvedUserOptions, StreamPluginOptions } from "../types.js";
import { type Manifest, type Plugin } from "vite";
import { transformModuleIfNeeded } from "../loader/react-loader.js";
import { join } from "node:path";
import { tryManifest } from "../helpers/tryManifest.js";

/**
 * Plugin for transforming server actions for the client build.
 *
 * Core responsibilities:
 * 1. Transforms "use server" directives
 * 2. Transforms server actions for the client build
 * 3. Uses react-loader's transformModuleIfNeeded to create a server action reference
 *
 * When a component is marked with "use server", it:
 * - Gets transformed into a server action
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
    name: "vite:react-server-action-transform",
    enforce: "pre",
    async config(_, configEnv) {
      isBuild = configEnv.command !== "serve";
      if (!configEnv.isSsrBuild) {
        staticManifest = {};
      } else {
        const staticManifestResult = await tryManifest({
          root: userOptions.projectRoot,
          ssrManifest: false,
          outDir: join(userOptions.build.outDir, userOptions.build.static),
        });
        if (staticManifestResult.type === "error") {
          staticManifest = {};
        } else {
          staticManifest = staticManifestResult.manifest;
        }
      }
    },
    async transform(code, id, options) {
      const ssr = options?.ssr;
      const isServer = code.match('"use server"') !== null;
      const isClient = code.match('"use client"') !== null;
      if (!ssr) return null;
      if (!isServer && !isClient) return null;
      if (isServer && isClient) {
        throw new Error(
          "Server and client components cannot be used in the same file"
        );
      }
      if (isClient) {
        return null;
      }
      if (isServer && isBuild) {
        const [key] = userOptions.normalizer(id);
        id = "/" + key + ".js";
      }
      const transformed = await transformModuleIfNeeded(code, id, null);
      if (!transformed) return null;
      return {
        code: transformed,
        id: id,
        map: null,
      };
    },
    renderChunk(code, chunk, _options) {
      // Only process client components
      if (!chunk.fileName.includes(".client")) return null;

      // Get the original file name without extension
      const originalName = chunk.fileName.replace(".js", "");

      // Find matching entry in static manifest
      const manifestEntry = Object.entries(staticManifest).find(([_, info]) =>
        info.file.startsWith(originalName)
      );

      if (manifestEntry) {
        // Use the static manifest's file name
        return {
          code,
          fileName: manifestEntry[1].file,
        };
      }

      return null;
    },
  };
}
