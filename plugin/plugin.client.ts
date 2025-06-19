import { reactPreservePlugin } from "./preserver/plugin.js";
import type { StreamPluginOptions } from "../types.js";
import { reactClientPlugin } from "./react-client/plugin.js";
import { envPlugin } from "./env/plugin.js";
import type { Plugin } from "vite";

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
 * - reactPreservePlugin
 * @param options
 * @returns
 */
export const vitePluginReactServer: VitePluginReactClientFn =
  function _vitePluginReactClient(options) {
    if (options == null) {
      throw new Error("options is required");
    }
    return [
      envPlugin(),
      reactClientPlugin(options),
      reactPreservePlugin(options),
    ];
  };

/**
 * Vite plugin for the React client, use specific name to support static import (that doesn't conflict with vitePluginReactServer)
 * Includes:
 * - envPlugin
 * - reactClientPlugin
 * - reactPreservePlugin
 * @param options
 * @returns
 */
export const vitePluginReactClient = vitePluginReactServer;
