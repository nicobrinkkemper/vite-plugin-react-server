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
  }
  
  const resolvedOptions = resolveOptions(options);
  if (resolvedOptions.type === "error") {
    if (resolvedOptions.error != null) {
      throw resolvedOptions.error;
    }
    throw new Error("Failed to resolve options");
  }
  const userOptions = resolvedOptions.userOptions;
  

  let configEnv: ConfigEnv | undefined;
  let hmrHandler: { restart: (() => Promise<void>) | null; sendHmrUpdate: (file: string, routes?: string[]) => void } | null = null;
  let isProcessingHmr = false; // Prevent recursive HMR updates
  let restartTimeout: NodeJS.Timeout | null = null; // Debounce worker restarts

  return {
    name: "vite-plugin-react-server:dev-server-client",
    apply: "serve", // Only apply in dev server mode
    // Note: Removed applyToEnvironment - handleHotUpdate needs to run regardless
    // The plugin should apply to client environment, but handleHotUpdate is a dev server hook
    // that should work regardless of environment filtering
    config(_config, viteConfigEnv) {
      configEnv = viteConfigEnv;
  
    },
    configureServer(server) {      
      // Log that plugin is being configured
      server.config.logger.info(`[vite-plugin-react-server] Dev server plugin configured for client environment`);
      
      // Configure the React server for client environment (worker-based)
      // This uses the existing configureReactServer.client.js implementation
      hmrHandler = configureReactServer({
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
    handleHotUpdate({ file, server }) {
      // Prevent recursive HMR updates
      if (isProcessingHmr) {
        return undefined;
      }
      
      // Handle server component file changes
      const moduleBase = userOptions.moduleBase || "src";
      const projectRoot = userOptions.projectRoot || server.config.root;
      
      // Normalize paths for comparison (handle both absolute and relative)
      const normalizedFile = file.replace(projectRoot, '').replace(/^\/+/, '');
      const isServerFile = normalizedFile.startsWith(moduleBase + '/') && 
        (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.jsx') || file.endsWith('.js'));
      
      // Always log for debugging
      server.config.logger.info(`[vite-plugin-react-server] handleHotUpdate: file=${file}, normalized=${normalizedFile}, isServerFile=${isServerFile}, hasHandler=${!!hmrHandler}`);
      
      if (isServerFile && hmrHandler) {
        isProcessingHmr = true;
        
        try {
          server.config.logger.info(`[vite-plugin-react-server] File changed: ${file}, sending HMR update...`);
          
          // CRITICAL: Send HMR_UPDATE message to worker to invalidate modules
          // This clears component caches, but Node.js's ES module cache persists
          hmrHandler.sendHmrUpdate(file);
          
          // CRITICAL: Send custom HMR message to client via WebSocket
          // Server components aren't in the client bundle, so vite:beforeUpdate doesn't fire
          // We need to manually notify the client to refetch the RSC stream
          server.ws.send({
            type: 'custom',
            event: 'vite-plugin-react-server:server-component-update',
            data: {
              file: normalizedFile,
              path: file,
            },
          });
          
          // CRITICAL: Node.js caches ES modules, so we need to restart the worker
          // to clear the module cache. Debounce restarts to prevent recursion.
          if (hmrHandler.restart) {
            // Clear any pending restart
            if (restartTimeout) {
              clearTimeout(restartTimeout);
            }
            
            // Debounce worker restart to prevent recursion
            // Wait 500ms after the last file change before restarting
            restartTimeout = setTimeout(async () => {
              try {
                server.config.logger.info(`[vite-plugin-react-server] Restarting worker to clear Node.js module cache...`);
                await hmrHandler!.restart!();
                server.config.logger.info(`[vite-plugin-react-server] Worker restarted successfully`);
              } catch (error) {
                server.config.logger.error(`[vite-plugin-react-server] Failed to restart worker: ${error}`);
              } finally {
                restartTimeout = null;
                // Reset flag after restart completes
                setTimeout(() => {
                  isProcessingHmr = false;
                }, 100);
              }
            }, 500); // 500ms debounce
          } else {
            // No restart function available yet - worker hasn't been created
            // This is expected if handleHotUpdate fires before the first request
            server.config.logger.warn(`[vite-plugin-react-server] Restart function not available yet - worker will be created on next request`);
            setTimeout(() => {
              isProcessingHmr = false;
            }, 100);
          }
        } catch (error) {
          server.config.logger.error(`[vite-plugin-react-server] Error handling HMR update: ${error}`);
          isProcessingHmr = false;
        }
      } else if (isServerFile && !hmrHandler) {
        server.config.logger.warn(`[vite-plugin-react-server] Server file changed but HMR handler not available yet: ${file}`);
      }
      
      // Return undefined to allow other plugins to handle the update
      return undefined;
    },
  };
};
