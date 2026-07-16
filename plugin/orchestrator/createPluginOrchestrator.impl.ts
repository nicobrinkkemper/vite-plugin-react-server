import type { Plugin } from "vite";
import { createEnvironmentPlugin } from "../environments/createEnvironmentPlugin.js";
import { createBuildEventPlugin } from "../environments/createBuildEventPlugin.js";
import { createVendoredPackageJsonPlugin } from "../environments/createVendoredPackageJsonPlugin.js";
import { createTransformerPlugin } from "../transformer/createTransformerPlugin.js";
import { serverReferenceClientPlugin } from "../transformer/serverReferenceClientPlugin.js";
import { virtualRscHmrPlugin } from "../dev-server/virtualRscHmrPlugin.js";
import { vitePluginVendorAlias } from "../vendor/vendor-alias.js";
import { clientPackagesDiscoveryPlugin } from "../clientPackages/index.js";

/**
 * Per-side inputs for the orchestrator. The server- and client-first variants
 * differ ONLY in which dev-server / react-static plugins they pull (.server vs
 * .client) and the transformer's defaultEnvironment.
 */
export interface OrchestratorStrategy {
  defaultEnvironment: "server" | "client";
  devServerPlugin: (userOptions: any) => Plugin | Plugin[];
  staticPlugin: (userOptions: any) => Plugin;
}

/**
 * Shared body for the server- and client-first orchestrators. Everything except
 * the per-side inputs above is identical: the plugin push order, the
 * shared-userOptions-reference invariant, and the environment wiring.
 *
 * INVARIANT: every plugin below must receive the same `userOptions` *reference*.
 * Spreading (`{...userOptions, foo}`) into a new object breaks the chain — the
 * spread copy keeps the pre-discovery value of `clientPackages` and silently
 * regresses node_modules `"use client"` handling. Mutate fields on userOptions
 * directly instead.
 */
export const createPluginOrchestratorImpl = (
  userOptions: any,
  strategy: OrchestratorStrategy
): Plugin[] => {
  // Provide all environments for Environment API builds.
  const availableEnvironments = ["client", "ssr", "server"];
  const plugins: Plugin[] = [];

  // Auto-discover packages that opt into the `"use client"` convention via
  // `react` in peerDependencies, merged with any manual `clientPackages`.
  // Mutates `userOptions.clientPackages` (see invariant above).
  plugins.push(clientPackagesDiscoveryPlugin(userOptions));

  // Alias react-server-dom-esm to our vendored copy.
  plugins.push(vitePluginVendorAlias());

  // Virtual module for RSC HMR utilities (dev and build).
  plugins.push(virtualRscHmrPlugin());

  // Redirect client-side imports of "use server" modules to a virtual client
  // proxy (createServerReference). Must precede the transformer.
  plugins.push(serverReferenceClientPlugin(userOptions));

  // Transformer first, so it runs before the other plugins.
  plugins.push(
    createTransformerPlugin({
      name: "dynamic",
      defaultEnvironment: strategy.defaultEnvironment,
      allowedEnvironments: ["client", "ssr", "server"],
    })(userOptions)
  );

  // Core plugins. Mutating `availableEnvironments` on userOptions (rather than
  // spreading) preserves the shared reference per the invariant above.
  (userOptions as { availableEnvironments?: unknown }).availableEnvironments =
    availableEnvironments;
  plugins.push(createEnvironmentPlugin(userOptions));
  plugins.push(createBuildEventPlugin(userOptions));

  // Mark `preserveModules`-emitted dependency chunks under `node_modules/` as
  // ESM, so they still parse as ESM where the root package.json isn't
  // co-located (serverless functions ship only the build output).
  plugins.push(createVendoredPackageJsonPlugin());

  const devServerPlugins = strategy.devServerPlugin(userOptions);
  if (Array.isArray(devServerPlugins)) {
    plugins.push(...devServerPlugins);
  } else {
    plugins.push(devServerPlugins);
  }

  // SSG plugin (server-first gated on an always-true capability before; the
  // client-first variant pushed it unconditionally — identical behavior).
  plugins.push(strategy.staticPlugin(userOptions));

  return plugins;
};
