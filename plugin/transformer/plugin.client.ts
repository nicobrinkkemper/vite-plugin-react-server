import { resolveOptions } from "../config/resolveOptions.js";
import type { ResolvedUserOptions, StreamPluginOptions } from "../types.js";
import { type Plugin } from "vite";
import { transformModuleIfNeeded } from "../loader/react-loader.js";

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

export function reactTransformPlugin(
  options: StreamPluginOptions
): Plugin {
  let userOptions: ResolvedUserOptions;
  const resolvedOptionsResult = resolveOptions(options);
  if (resolvedOptionsResult.type === "error") throw resolvedOptionsResult.error;
  userOptions = resolvedOptionsResult.userOptions;
  return {
    name: "vite:react-server-action-transform",
    enforce: "pre",
    config(_, configEnv) {
      isBuild = configEnv.command !== "serve";
    },
    async transform(code, id, options) {
      const ssr = options?.ssr;
      if (!ssr) return null;
      if (!userOptions.autoDiscover.modulePattern(id)) return null;
      if(code.match('"use client"') && !userOptions.autoDiscover.clientComponents(id)) {
        const [key, value] = userOptions.normalizer(id);
        // if it's not already, emit it
        const hasId = this.getModuleInfo(id);
        if(!hasId) {
          this.emitFile({
            id,
            type: "chunk",
          });
        }
        return;
      }
      if (!code.match('"use server"')) return null;

      if(isBuild) {
        const [key] = userOptions.normalizer(id);
        // unlike the client references, we can asume the root of the server to be the server folder already, we do not have to use a relative path here
        // the .node.js is already enforced, but can't hurt to include it already here
        id = '/' + key + '.node.js';
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
