import type { StreamPluginOptions } from "../types.js";
import { reactClientPlugin } from "./react-client/plugin.js";
import { envPlugin } from "./env/plugin.js";
import type { Plugin } from "vite";
import { reactTransformPlugin } from "./transformer/plugin.client.js";

export type VitePluginReactClientFn = <
  Opt extends StreamPluginOptions = StreamPluginOptions
>(
  options: Opt
) => Plugin[];

/**
 * Vite plugin for the React client, use same name to support dynamic import.
 * Includes:
 * - envPlugin
 * - reactClientPlugin
 * - reactPreservePlugin (handles directive removal/preservation)
 * @param options
 * @returns
 */
export const vitePluginReactServer: VitePluginReactClientFn =
  function _vitePluginReactClient(options) {
    if (options == null) {
      throw new Error("options is required");
    }
    
    const plugins = [
      envPlugin(),
      reactTransformPlugin(options),
      reactClientPlugin(options),
    ];
    
    return plugins;
  };

/**
 * Vite plugin for the React client, use specific name to support static import (that doesn't conflict with vitePluginReactServer)
 * Includes:
 * - envPlugin
 * - reactClientPlugin
 * - reactPreservePlugin (handles directive removal/preservation)
 * @param options
 * @returns
 */
export const vitePluginReactClient = vitePluginReactServer;
