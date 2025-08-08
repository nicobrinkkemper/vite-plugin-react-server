import type {  VitePluginReactClientFn } from "../types.js";
import { reactClientPlugin } from "./react-client/plugin.client.js";
import { reactServerPlugin } from "./react-server/plugin.client.js";
import { envPlugin } from "./env/plugin.js";
import { reactTransformPlugin } from "./transformer/plugin.client.js";
import { reactStaticPlugin } from "./react-static/plugin.client.js";


/**
 * Semantic import logic.
 * 
 * This is the main entrypoint for the client plugin, which helps to keep the namespace vitePluginReactServer
 * re-usable across all conditions. However, this is only the applied when using the MAIN entrypointm
 * when a user directly wrote vite-plugin-react-server/client it should assert the condition is react-client
 * 
 * Vite plugin for the React client, use same name to support dynamic import.
 * Includes:
 * - envPlugin
 * - reactClientPlugin
 * - reactStaticPlugin (handles static assets)
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
      reactServerPlugin(options),
    ];
    // since this is the server plugin but it runs on the client, we need to add the react-client-static plugin
    if (options.build?.pages) {
      plugins.push(reactStaticPlugin(options));
    }
    
    return plugins;
  };

/**
 * Vite plugin for the React client, use specific name to support static import (that doesn't conflict with vitePluginReactServer)
 * Includes:
 * - envPlugin
 * - reactClientPlugin
 * @param options
 * @returns
 */
export const vitePluginReactClient: VitePluginReactClientFn =
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
