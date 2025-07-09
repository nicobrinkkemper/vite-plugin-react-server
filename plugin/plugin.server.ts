import { reactStaticPlugin } from "./react-static/plugin.js";
import { reactTransformPlugin } from "./transformer/plugin.server.js";
import type {
  StreamPluginOptions,
} from "./types.js";
import { reactServerPlugin } from "./react-server/plugin.js";
import { envPlugin } from "./env/plugin.js";
import type { Plugin } from "vite";

export type VitePluginReactServerFn = <
  Opt extends StreamPluginOptions = StreamPluginOptions
>(
  options: Opt
) => Plugin[];

/**
 * Vite plugin for the React server, use same name to support dynamic import.
 * Includes:
 * - envPlugin
 * - reactTransformPlugin
 * - reactServerPlugin
 * - reactStaticPlugin (if build.pages is not empty)
 * - reactPreservePlugin (handles directive removal/preservation)
 */
export const vitePluginReactServer: VitePluginReactServerFn =
  function _vitePluginReactServer(
    options
  ) {
    if(options == null) {
      throw new Error("options is required");
    }
    const basePlugins = [
      envPlugin(),
      reactTransformPlugin(options),
      reactServerPlugin(options),
    ];

    if (
      !options.build?.pages ||
      (Array.isArray(options.build.pages) && options.build.pages.length === 0)
    ) {
      // in this case we do not need the static plugin at all
      return basePlugins;
    }
    
    // Add static plugin for static builds
    return [
      ...basePlugins,
      reactStaticPlugin(options),
    ];
  };
