import type { VitePluginFn } from "../../types.js";
import { configureReactServer } from "./configureReactServer.client.js";
import { resolveOptions } from "../config/resolveOptions.js";
import type { ConfigEnv } from "vite";


/**
 * Dev server plugin for client environment.
 * Uses configureServer hook for proper dev server setup.
 */
export const vitePluginReactDevServer: VitePluginFn = function _vitePluginReactServerDevClient(options) {
  if (options == null) {
    throw new Error("options is required");
  }

  if (options.verbose) {
    console.log(`[plugin.client] input options.projectRoot: ${options.projectRoot}`);
  }
  
  const resolvedOptions = resolveOptions(options);
  if (resolvedOptions.type === "error") {
    if (resolvedOptions.error != null) {
      throw resolvedOptions.error;
    }
    throw new Error("Failed to resolve options");
  }
  const userOptions = resolvedOptions.userOptions;
  
  if (options.verbose) {
    console.log(`[plugin.client] resolved userOptions.projectRoot: ${userOptions.projectRoot}`);
  }

  let configEnv: ConfigEnv | undefined;

  return {
    name: "vite-plugin-react-server:dev-server-client",
    apply: "serve", // Only apply in dev server mode
    applyToEnvironment(partialEnvironment: any  ) {
      // Only apply to server environment
      return partialEnvironment?.name === 'server';
    },
    config(_config, viteConfigEnv) {
      configEnv = viteConfigEnv;
      if (options.verbose) {
        console.log(`[plugin.client] configEnv:`, viteConfigEnv);
      }
    },
    configureServer(server) {      
      // Configure the React server for client environment (worker-based)
      // This uses the existing configureReactServer.client.js implementation
      configureReactServer({
        server,
        autoDiscoveredFiles: {
          propsMap: new Map(),
          pageMap: new Map(),
          rootMap: new Map(),
          htmlMap: new Map(),
          routeMap: new Map(),
          urlMap: new Map(),
          errors: [],
          workerPaths: {},
          serverEntry: null,
          clientEntry: {},
          clientInputs: {},
          staticInputs: {},
          serverInputs: {},
          // staticManifest removed from AutoDiscoveredFiles
          serverActions: {},
        },
        userOptions,
        configEnv: configEnv!,
        serverManifest: {}, 
        resolvedConfig: server.config,
      });
    },
  };
};
