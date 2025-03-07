import { resolveOptions } from "../config/resolveOptions.js";
import type { InputNormalizer, ResolvedUserOptions, StreamPluginOptions } from "../types.js";
import { type Manifest, type Plugin } from "vite";
import { transformModuleIfNeeded } from "../loader/react-loader.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { createInputNormalizer } from "../helpers/inputNormalizer.js";
import { tryManifest } from "../helpers/tryManifest.js";
import { join } from "node:path";
import type { ResolveUserConfigReturn } from "../config/resolveUserConfig.js";
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

export function reactTransformPlugin(options: StreamPluginOptions): Plugin {
  let normalizer: InputNormalizer;
  let clientManifest: Manifest;
  let isDev:boolean;
  let userOptions: ResolvedUserOptions
  return {
    name: "vite:react-transform",
    enforce: "pre", // Run before Vite's transforms
    config(config, configEnv) {
      const resolvedOptionsResult = resolveOptions(
        options,
        config.build?.outDir?.startsWith(
          join(options.build?.outDir ?? DEFAULT_CONFIG.BUILD.outDir, options.build?.client ?? DEFAULT_CONFIG.BUILD.client)
        ) ?? false
      );
      isDev = configEnv.mode === "development" && configEnv.command === "serve"
      if (resolvedOptionsResult.type === "error") throw resolvedOptionsResult.error;
      userOptions = resolvedOptionsResult.userOptions;
      normalizer = createInputNormalizer({
        root: resolvedOptionsResult.userOptions.projectRoot,
        preserveModulesRoot: undefined,
        removeExtension: false,
      });

    },
    async transform(code, id, options) {
      const ssr = options?.ssr ?? false;
      if (!ssr) return null;
      if (!id.match(DEFAULT_CONFIG.FILE_REGEX)) return null;
      if (!code.match('"use client"')) return null;
      
      // Get the client manifest
      const clientManifestResult = tryManifest({
        root: userOptions.projectRoot,
        outDir: join(
          userOptions.build.outDir,
          userOptions.build.client
        ),
        ssrManifest: false,
      });
      if (clientManifestResult.type === "error") throw clientManifestResult.error;
      clientManifest = clientManifestResult.manifest;
      const [key, value] = normalizer(id);
      const transformed = await transformModuleIfNeeded(
        code,
        id,
        // Pass null for nextLoad since we don't need module loading in the plugin
        null
      );
      if (!transformed) return null;
      if (isDev) {
        return {
          code: transformed,
          map: null,
        };
      }
      const moduleIdIndex = transformed.indexOf(value);
      if (moduleIdIndex === -1) {
        console.warn(
          `[vite-plugin-react-server] Could not find module id in transformed code. Ignoring.`,
          {
            code,
            id,
            transformed,
          }
        );
        return null;
      }
      const clientPath = clientManifest[key]?.file;

      if (!clientPath) {
        console.warn(
          `[vite-plugin-react-server] Could not find client path for ${value}. Ignoring.`
        );
        return null;
      }
      return {
        code: transformed.replace(key, clientPath),
        map: null,
      };
    },
  };
}
