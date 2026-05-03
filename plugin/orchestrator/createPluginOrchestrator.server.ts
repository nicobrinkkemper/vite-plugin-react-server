import type { Plugin } from "vite";
import { createEnvironmentPlugin } from "../environments/createEnvironmentPlugin.js";
import { createBuildEventPlugin } from "../environments/createBuildEventPlugin.js";
import { vitePluginReactDevServer } from "../dev-server/plugin.server.js";
import { reactStaticPlugin } from "../react-static/plugin.server.js";
import { createTransformerPlugin } from "../transformer/createTransformerPlugin.js";
import { virtualRscHmrPlugin } from "../dev-server/virtualRscHmrPlugin.js";
import { vitePluginVendorAlias } from "../vendor/vendor-alias.js";
import { clientPackagesDiscoveryPlugin } from "../config/clientPackagesDiscovery.js";

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

  // Auto-discover packages that opt into the `"use client"` convention via
  // `react` in peerDependencies. Mutates userOptions.clientPackages before
  // the transformer's configResolved + resolveUserConfig run.
  plugins.push(clientPackagesDiscoveryPlugin(userOptions));

  // Alias react-server-dom-esm to our vendored copy
  plugins.push(vitePluginVendorAlias());

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
  // Mutate availableEnvironments directly on userOptions instead of spreading
  // into a new object — preserves the shared reference so the discovery
  // plugin's mutation of `clientPackages` is visible here when this plugin's
  // async `config` hook later reads `options.clientPackages`.
  (userOptions as { availableEnvironments?: unknown }).availableEnvironments =
    availableEnvironments;
  plugins.push(createEnvironmentPlugin(userOptions));
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


export interface Strategy {
  mode?: "auto" | "server" | "client";
  bundleTarget?: "server" | "client" | "ssr";
  importContext?: "react-server" | "react-client";
  mainThreadCondition?: "react-server" | "react-client";
  legacyBuilder?: boolean;
  staticBuild?: boolean;
  ssg?: boolean;
  forceCapabilities?: {
    staticGeneration?: boolean;
    serverComponents?: boolean;
    clientBuilds?: boolean;
    ssrBuilds?: boolean;
  };
}
