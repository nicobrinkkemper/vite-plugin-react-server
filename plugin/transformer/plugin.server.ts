import { resolveOptions } from "../config/resolveOptions.js";
import type { Manifest } from "vite";
import { tryManifest } from "../helpers/tryManifest.js";
import { getNodeEnv, isValidEnv } from "../getNodeEnv.js";
import { createTransformer } from "../loader/createTransformer.js";
import type { ReactStreamPluginFn, ReactStreamPluginMeta } from "../types.js";
import type { Program } from "acorn";
import { join } from "node:path";


export type ReactTransformPluginFn = ReactStreamPluginFn<{
  meta: ReactStreamPluginMeta;
}>

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
export const reactTransformPlugin: ReactTransformPluginFn = (options) => {
  const resolvedOptionsResult = resolveOptions(options);

  if (resolvedOptionsResult.type === "error") throw resolvedOptionsResult.error;

  const { userOptions } = resolvedOptionsResult;

  let staticManifest: Manifest = {};
  let isBuild = true;
  let isSSR = true;
  const nodeEnv = getNodeEnv();
  let mode = nodeEnv;

  return {
    name: "vite-plugin-react-server:transform",
    enforce: "post",
    configResolved(config) {
      isBuild = config.command === "build";
      isSSR = Boolean(config.build.ssr);
      mode = config.mode as "development" | "production" | "test";
      if (!isValidEnv(mode)) {
        throw new Error(`Invalid mode: ${mode}`);
      }
    },
    async buildStart() {
      if (isBuild && isSSR) {
        const manifestResult = await tryManifest({
          root: userOptions.projectRoot,
          outDir: join(userOptions.build.outDir, userOptions.build.static),
          ssrManifest: false
        });
        if (manifestResult.type === "success") {
          staticManifest = manifestResult.manifest;
        }
      }
    },
    async transform(code, id, options) {
      if (!options?.ssr || !userOptions.autoDiscover.modulePattern.test(id)) {
        return null;
      }

      let [, moduleID] = userOptions.normalizer(id);
      if (isBuild) {
        if (staticManifest) {
          if (moduleID in staticManifest) {
            moduleID = staticManifest[moduleID].file;
          }
        } else {
          throw new Error(`Static manifest not found during dev build.`);
        }
      }
      
      const finalID = userOptions.moduleID(moduleID);

      // Create a new transformer with the computed values
      const transformer = createTransformer({
        parseFn: async (source) => {
          const ast = this.parse(source) as Program;
          return {
            ast,
            code: source,
            map: null
          };
        },
        options: {
          loader: userOptions.loader,
          verbose: userOptions.verbose,
          failOnWarnings: userOptions.failOnWarnings
        },
        isServerEnvironment: true,
      });
      // Always transform in server context
      const {code: transformed, map} = await transformer(
        code,
        finalID
      );
      if (userOptions.verbose)
        if (transformed !== code) {
          if (id !== finalID) {
            this.environment.logger.info(
              "[react-server-transform] " +
                id.split("/").pop() +
                " -> " +
                finalID
            );
          } else {
            this.environment.logger.info(
              "[react-server-transform] " +
                id.split("/").pop() +
                (code.startsWith('"use client"') ? " (client)" : "")
            );
          }
          this.environment.logger.info(
            "[react-server-transform] " + transformed
          );
        }
      return {
        code: transformed,
        map: map,
      };
    }
  };
}
