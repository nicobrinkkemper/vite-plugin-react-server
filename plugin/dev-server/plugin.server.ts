import type { StreamPluginOptions } from "../../types.js";
import { configureReactServer } from "./configureReactServer.server.js";
import { resolveOptions } from "../config/resolveOptions.js";
import type { Plugin, ViteDevServer } from "vite";

/**
 * Dev server plugin for server environment.
 * Returns two plugins: one for HMR handling (all environments) and one for server config.
 */
export const vitePluginReactDevServer = function _vitePluginReactServerDevServer(options: StreamPluginOptions): Plugin[] {
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

  // Separate plugin for HMR handling (must apply to all environments to receive handleHotUpdate)
  const hmrPlugin = {
    name: "vite-plugin-react-server:server-hmr",
    apply: "serve" as const,
    handleHotUpdate({ file, server }: { file: string; server: ViteDevServer }) {
      const moduleBase = userOptions.moduleBase || "src";
      const projectRoot = userOptions.projectRoot || server.config.root;
      const normalizedFile = file.replace(projectRoot, '').replace(/^\/+/, '');
      const isServerFile = normalizedFile.startsWith(moduleBase + '/') && 
        (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.jsx') || file.endsWith('.js'));
      
      if (isServerFile) {
        server.config.logger.info(`[vite-plugin-react-server] Server component changed: ${normalizedFile}`);
        
        // Send custom HMR event so client can refetch RSC stream
        server.ws.send({
          type: 'custom',
          event: 'vite-plugin-react-server:server-component-update',
          data: {
            file: normalizedFile,
            path: file,
          },
        });
        
        // Invalidate the server module so next request gets fresh content
        const mod = server.environments['server']?.moduleGraph?.getModulesByFile(file);
        if (mod) {
          for (const m of mod) {
            server.environments['server']?.moduleGraph?.invalidateModule(m);
          }
        }
        
        // Return empty array to prevent Vite's default full-page reload
        // The client will refetch the RSC stream via the custom event
        return [];
      }
    },
  };

  const serverPlugin = {
    name: "vite-plugin-react-server:dev-server-server",
    apply: "serve" as const,
    applyToEnvironment(partialEnvironment: any) {
      return partialEnvironment?.consumer === 'server';
    },
    configureServer(server: ViteDevServer) {
      // Log that plugin is being configured
      server.config.logger.info(`[vite-plugin-react-server] Dev server plugin configured for server environment (react-server condition)`);
      
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

  return [hmrPlugin, serverPlugin];
};
