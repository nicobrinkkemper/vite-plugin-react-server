import { resolveOptions } from "../config/resolveOptions.js";
import type {
  StreamPluginOptions,
} from "../types.js";
import type { Plugin } from "vite";

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
  const resolvedOptionsResult = resolveOptions(options);
  if (resolvedOptionsResult.type === "error") throw resolvedOptionsResult.error;

  return {
    name: "vite:react-loader",
  };
}
