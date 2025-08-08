import { reactStaticPlugin } from "./react-static/plugin.server.js";
import { reactTransformPlugin } from "./transformer/plugin.server.js";
import type {
  VitePluginMainFn,
  VitePluginReactClientFn,
} from "./types.js";
import { reactServerPlugin } from "./react-server/plugin.server.js";
import { reactClientPlugin } from "./react-client/plugin.server.js";

import { envPlugin } from "./env/plugin.js";
import { assertReactServer } from "./config/getCondition.js";
// import the .client transformer for the reactClientPlugin (it won't throw because there's no assert, but it will transform for the react-client)
import { reactTransformPlugin as reactTransformPluginClient } from "./transformer/plugin.client.js";

assertReactServer()

/**
 * Vite plugin for the React server, use same name to support dynamic import.
 * Includes:
 * - envPlugin
 * - reactTransformPlugin
 * - reactServerPlugin
 * - reactStaticPlugin (if build.pages is not empty)
 * - reactPreservePlugin (handles directive removal/preservation)
 */
export const vitePluginReactServer: VitePluginMainFn =
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

    console.log("🔍 Plugin server: pages configured:", options.build?.pages);

    if (
      !options.build?.pages ||
      (Array.isArray(options.build.pages) && options.build.pages.length === 0)
    ) {
      // in this case we do not need the static plugin at all
      console.log("🔍 Plugin server: no pages, returning base plugins only");
      return basePlugins 
    }
    // Add static plugin for static builds
    console.log("🔍 Plugin server: pages found, adding static plugin");
    return [
      ...basePlugins,
      reactStaticPlugin(options),
    ]
  };

  export const vitePluginReactClient: VitePluginReactClientFn =
    function _vitePluginReactClient(options) {
      if (options == null) {
        throw new Error("options is required");
      }
      
      const plugins = [
        envPlugin(),
        reactTransformPluginClient(options),
        reactClientPlugin(options),
      ];
      
      return plugins;
    }