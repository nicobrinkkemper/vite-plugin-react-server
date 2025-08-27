import type { VitePluginReactClientFn, StreamPluginOptions } from "../types.js";
import type { Plugin } from "vite";
import { resolveOptions } from "./config/resolveOptions.js";
import { envPlugin } from "./env/plugin.client.js";
import { createEnvironmentPlugin } from "./environments/createEnvironmentPlugin.js";
import { reactClientPlugin } from "./react-client/plugin.client.js";
import { reactServerPlugin } from "./react-server/plugin.client.js";

import { reactStaticPlugin } from "./react-static/plugin.client.js";
import { createBuildEventPlugin } from "./environments/createBuildEventPlugin.js";

// Build plugin - agnostic to condition
function createBuildPlugin(options: StreamPluginOptions): Plugin[] {
  const resolvedOptionsResult = resolveOptions(options);
  if (resolvedOptionsResult.type === "error") {
    throw resolvedOptionsResult.error;
  }
  const userOptions = resolvedOptionsResult.userOptions;
  
  const plugins = [
    envPlugin(options),
    createEnvironmentPlugin(options),
    reactClientPlugin(options),
    reactServerPlugin(options),
    createBuildEventPlugin(options),
  ];

  // Add static generation support
  if (userOptions.build?.pages) {
    if (Array.isArray(userOptions.build.pages)) {
      if (userOptions.build.pages.length > 0) {
        // Explicit routes - generate these pages
        plugins.push(reactStaticPlugin(options));
      } else {
        // Explicitly empty array - no pages to generate, don't add plugin
      }
    } else if (typeof userOptions.build.pages === 'function') {
      // Dynamic discovery function - add plugin to handle async discovery
      plugins.push(reactStaticPlugin(options));
    }
  } else {
    // Not configured - auto-discover from filesystem
    plugins.push(reactStaticPlugin(options));
  }
  
  return plugins;
}

/**
 * Main entrypoint for React Server Components in client environment.
 *
 * This plugin adapts its behavior based on the build context:
 * - In single builds: includes client plugin for client-side rendering
 * - In app mode (--app): includes both client and server plugins for full RSC support
 * - With static pages: adds static generation plugin when appropriate
 *
 * Use this for the most common case where you want RSC support in client environments.
 * @param options
 * @returns
 */
export const vitePluginReactServer: VitePluginReactClientFn =
  function _vitePluginReactClient(options) {
    if (options == null) {
      throw new Error("options is required");
    }

    // Always include all plugins - they will be conditionally activated
    return createBuildPlugin(options);
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
      envPlugin(options),
      reactClientPlugin(options),
    ];

    return plugins;
  };
