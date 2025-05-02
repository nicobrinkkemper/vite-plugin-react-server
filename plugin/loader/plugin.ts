import { resolveOptions } from "../config/resolveOptions.js";
import type {
  StreamPluginOptions,
} from "../types.js";
import type { ConfigEnv, Plugin, UserConfig } from "vite";
import { readFile } from "node:fs/promises";

/**
 * Plugin for loading various front-end react files like css-loader, react-loader, etc.
 *
 * Core responsibilities:
 * 1. Use the load hook to use the appropriate loader for the file type
 * 2. When used, we can assume that such files work the same as when used as node loader
 *
 * @example
 * ```ts
 * export default defineConfig({
 *   plugins: [
 *     reactLoaderPlugin({
 *       projectRoot: process.cwd(),
 *     })
 *   ]
 * });
 * ```
 */

export function reactLoaderPlugin(options: StreamPluginOptions): Plugin {
  const virtualModuleId = "virtual:vite-react-loader";
  const resolvedVirtualModuleId = "\0" + virtualModuleId;
  const resolvedOptionsResult = resolveOptions(options);
  if (resolvedOptionsResult.type === "error") throw resolvedOptionsResult.error;
  const userOptions = resolvedOptionsResult.userOptions;

  return {
    name: "vite:react-loader",
  };
}
