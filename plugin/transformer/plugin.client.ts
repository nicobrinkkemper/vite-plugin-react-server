import { resolveOptions } from "../config/resolveOptions.js";
import type {
  InlineCssOpt,
  PagePropOpt,
  ResolvedUserOptions,
  StreamPluginOptions,
} from "../types.js";
import type { Plugin } from "vite";
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
export function reactTransformPlugin<
  T extends PagePropOpt = PagePropOpt,
  InlineCSS extends InlineCssOpt = InlineCssOpt
>(options: StreamPluginOptions<T, InlineCSS>): Plugin {
  let userOptions: ResolvedUserOptions<T, InlineCSS>;
  const resolvedOptionsResult = resolveOptions(options);
  if (resolvedOptionsResult.type === "error") throw resolvedOptionsResult.error;
  userOptions = resolvedOptionsResult.userOptions;

  let isBuild = true;
  let isSSR = false;
  return {
    name: "react-transform",
    enforce: "pre", // Run before Vite's transforms
    async config(config, configEnv) {
      isBuild = configEnv.command === "build";
      isSSR = configEnv.isSsrBuild || Boolean(config?.build?.ssr);
      if (isBuild && isSSR) {
        const staticManifestResult = await tryManifest({
          root: userOptions.projectRoot,
          ssrManifest: false,
          outDir: join(userOptions.build.outDir, userOptions.build.static),
        });
        if (staticManifestResult.type === "error") {
          throw staticManifestResult.error;
        }
      }
    },
  };
}
