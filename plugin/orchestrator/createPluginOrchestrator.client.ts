import type { Plugin } from "vite";
import { createEnvironmentPlugin } from "../environments/createEnvironmentPlugin.js";
import { createBuildEventPlugin } from "../environments/createBuildEventPlugin.js";
import { vitePluginReactDevServer } from "../dev-server/plugin.client.js";
import { reactStaticPlugin } from "../react-static/plugin.client.js";

// Client-first orchestrator - includes client SSG plugin for reverse paradigm
export const createPluginOrchestrator = (
  userOptions: any
): Plugin[] => {
  // Client-first logic - provide all environments for Environment API builds
  const availableEnvironments = ["client", "ssr", "server"];

  const plugins: Plugin[] = [];
  
  // Core plugins
  plugins.push(createEnvironmentPlugin({
    ...userOptions,
    availableEnvironments,
  }));
  plugins.push(createBuildEventPlugin(userOptions));
  plugins.push(vitePluginReactDevServer(userOptions));

  // Client SSG plugin for reverse paradigm
  plugins.push(reactStaticPlugin(userOptions));

  return plugins;
};
