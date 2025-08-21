import type { VitePluginFn } from "../../types.js";
import { configureReactServer } from "./configureReactServer.server.js";
import { resolveOptions } from "../config/resolveOptions.js";
import type { ViteDevServer } from "vite";

/**
 * Dev server plugin for server environment.
 * Uses configureServer hook for proper dev server setup.
 */
export const vitePluginReactDevServer: VitePluginFn = function _vitePluginReactServerDevServer(options) {
  if (options == null) {
    throw new Error("options is required");
  }

  const resolvedOptions = resolveOptions(options);
  if (resolvedOptions.type === "error") {
    if (resolvedOptions.error != null) {
      throw resolvedOptions.error;
    }
    throw new Error("Failed to resolve options");
  }
  const userOptions = resolvedOptions.userOptions;

  return {
    name: "vite-plugin-react-server:dev-server-server",
    configureServer(server: ViteDevServer) {      
      // Configure the React server for server environment (direct RSC processing)
      // This uses the existing configureReactServer.server.js implementation
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
        serverManifest: {},
        resolvedConfig: server.config,
      });
    },
  };
};
