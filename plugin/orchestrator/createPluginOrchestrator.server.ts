import type { Plugin } from "vite";
import { createEnvironmentPlugin } from "../environments/createEnvironmentPlugin.js";
import { createBuildEventPlugin } from "../environments/createBuildEventPlugin.js";
import { vitePluginReactDevServer } from "../dev-server/plugin.server.js";
import { reactStaticPlugin } from "../react-static/plugin.server.js";

// Server-first orchestrator - only imports server plugins
export const createPluginOrchestrator = (
  userOptions: any
): Plugin[] => {
  // Server-first logic - provide all environments for Environment API builds
  const availableEnvironments = ["client", "ssr", "server"];
  const capabilities = {
    staticGeneration: true,
    serverComponents: true,
    clientBuilds: true,
    ssrBuilds: true,
  };

  const plugins: Plugin[] = [];
  
  // Core plugins
  plugins.push(createEnvironmentPlugin({
    ...userOptions,
    availableEnvironments,
  }));
  plugins.push(createBuildEventPlugin(userOptions));
  plugins.push(vitePluginReactDevServer(userOptions));

  // SSG plugin for server
  if (capabilities.staticGeneration) {
    plugins.push(reactStaticPlugin(userOptions));
  }

  return plugins;
};
