import type { Plugin } from "vite";
import { createEnvironmentPlugin } from "../environments/createEnvironmentPlugin.js";
import { createBuildEventPlugin } from "../environments/createBuildEventPlugin.js";
import { vitePluginReactDevServer } from "../dev-server/plugin.server.js";
import { reactStaticPlugin } from "../react-static/plugin.server.js";
import { createTransformerPlugin } from "../transformer/createTransformerPlugin.js";
import { serverReferenceClientPlugin } from "../transformer/serverReferenceClientPlugin.js";
import { virtualRscHmrPlugin } from "../dev-server/virtualRscHmrPlugin.js";
import { vitePluginVendorAlias } from "../vendor/vendor-alias.js";
import { clientPackagesDiscoveryPlugin } from "../clientPackages/index.js";

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
  // `react` in peerDependencies, and merge with any manual `clientPackages`
  // the user supplied. Mutates `userOptions.clientPackages` so downstream
  // plugins read the merged list when their own hooks fire.
  //
  // INVARIANT: every plugin below must receive the same `userOptions`
  // *reference*. Spreading (`{...userOptions, foo}`) into a new object
  // breaks the chain — the spread copy keeps the pre-discovery value of
  // `clientPackages` and silently regresses node_modules `"use client"`
  // handling. Mutate fields on userOptions directly instead.
  plugins.push(clientPackagesDiscoveryPlugin(userOptions));

  // Alias react-server-dom-esm to our vendored copy
  plugins.push(vitePluginVendorAlias());

  // Virtual module for RSC HMR utilities (works in both dev and build)
  plugins.push(virtualRscHmrPlugin());

  // Redirect client-side imports of "use server" modules to a virtual client
  // proxy (createServerReference) so they resolve in dev (client/ssr envs are
  // served here too in dev:rsc). Must precede the transformer.
  plugins.push(serverReferenceClientPlugin(userOptions));

  // Add transformer first so it runs before other plugins
  plugins.push(
    createTransformerPlugin({
      name: "dynamic",
      defaultEnvironment: "server",
      allowedEnvironments: ["client", "ssr", "server"],
    })(userOptions)
  );
  
  // Core plugins. Mutating `availableEnvironments` on userOptions (rather
  // than spreading into a new object) preserves the shared reference per
  // the invariant above.
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
