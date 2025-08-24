import type { VitePluginMainFn, VitePluginReactClientFn, StreamPluginOptions } from "./types.js";
import type { Plugin } from "vite";
import { resolveOptions } from "./config/resolveOptions.js";

import { envPlugin } from "./env/plugin.server.js";
import { reactServerPlugin } from "./react-server/plugin.server.js";

import { assertReactServer } from "./config/getCondition.js";
import { reactClientPlugin } from "./react-client/plugin.server.js";
import { reactStaticPlugin } from "./react-static/plugin.server.js";
import { vitePluginReactDevServer } from "./dev-server/plugin.server.js";
import { createBuildEventPlugin } from "./environments/createBuildEventPlugin.js";
import { createEnvironmentPlugin } from "./environments/createEnvironmentPlugin.js";

// Allow cross-environment testing - don't assert in test environments
if (!process.env["VITEST"] && !process.env.NODE_ENV?.includes("test")) {
  assertReactServer();
}

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
    reactServerPlugin(options),
    vitePluginReactDevServer(options),
    createBuildEventPlugin(options),
  ];

  // Add server-side static generation support if pages are configured
  if (userOptions.build?.pages) {
    const explicitRscWorker =
      typeof userOptions.build?.useRscWorker === "boolean"
        ? userOptions.build?.useRscWorker
        : false;
    const explicitHtmlWorker =
      typeof userOptions.build?.useHtmlWorker === "boolean"
        ? userOptions.build?.useHtmlWorker
        // by default, if non useHtmlWorker and no useRscWorker, the default is to
        // use the html worker
        : !explicitRscWorker;
    if (explicitHtmlWorker) {
      plugins.push(reactStaticPlugin(options));
    }
  }
  
  return plugins;
}

/**
 * Main entrypoint for React Server Components in server environment.
 *
 * This plugin adapts its behavior based on the build context:
 * - In single builds: includes server plugin for server-side rendering
 * - In app mode (--app): includes both server and client plugins for full RSC support
 * - With static pages: adds static generation plugin when appropriate
 *
 * Use this for the most common case where you want RSC support in server environments.
 * @param options
 * @returns
 */
export const vitePluginReactServer: VitePluginMainFn =
  function _vitePluginReactServer(options) {
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
