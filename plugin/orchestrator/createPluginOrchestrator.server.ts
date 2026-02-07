import type { Plugin } from "vite";
import { createEnvironmentPlugin } from "../environments/createEnvironmentPlugin.js";
import { createBuildEventPlugin } from "../environments/createBuildEventPlugin.js";
import { vitePluginReactDevServer } from "../dev-server/plugin.server.js";
import { reactStaticPlugin } from "../react-static/plugin.server.js";
import { createTransformerPlugin } from "../transformer/createTransformerPlugin.js";
import { virtualRscHmrPlugin } from "../dev-server/virtualRscHmrPlugin.js";

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

  // Virtual module for RSC HMR utilities (works in both dev and build)
  plugins.push(virtualRscHmrPlugin());
  
  // Add transformer first so it runs before other plugins
  plugins.push(
    createTransformerPlugin({
      name: "dynamic",
      defaultEnvironment: "server",
      allowedEnvironments: ["client", "ssr", "server"],
    })(userOptions)
  );
  
  // Core plugins
  plugins.push(createEnvironmentPlugin({
    ...userOptions,
    availableEnvironments,
  }));
  plugins.push(createBuildEventPlugin(userOptions));
  const devServerPlugins = vitePluginReactDevServer(userOptions);
  if (Array.isArray(devServerPlugins)) {
    plugins.push(...devServerPlugins);
  } else {
    plugins.push(devServerPlugins);
  }

  // SSG plugin for server
  if (capabilities.staticGeneration) {
    plugins.push(reactStaticPlugin(userOptions));
  }

  return plugins;
};
