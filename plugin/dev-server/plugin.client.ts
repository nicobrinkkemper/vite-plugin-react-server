import { readFileSync } from "node:fs";
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
    // No applyToEnvironment — hotUpdate needs to run for all environments
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
    hotUpdate(ctx: any) {
      const { file, server } = ctx;
      const envName = ctx.environment?.name ?? 'unknown';
      
      // Only run worker invalidation from the client environment (once per change)
      if (envName !== 'client') return;
      
      // Prevent recursive HMR updates
      if (isProcessingHmr) {
        return undefined;
      }
      
      // Handle server component file changes
      const moduleBase = userOptions.moduleBase || "src";
      const projectRoot = userOptions.projectRoot || server.config.root;
      
      // Normalize paths for comparison (handle both absolute and relative)
      const normalizedFile = file.replace(projectRoot, '').replace(/^\/+/, '');
      const isInModuleBase = normalizedFile.startsWith(moduleBase + '/');
      const isSourceFile = isInModuleBase &&
        (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.jsx') || file.endsWith('.js'));
      // CSS edits in dev:ssr must also trigger the worker-restart path: the SSR
      // worker imports compiled CSS modules through Node's loader, which caches
      // by URL. Vite re-transforming the file does nothing for already-imported
      // modules in the worker — without invalidating + restarting, the next
      // page render reuses the pre-edit class hashes (bd-5rk). dev:rsc doesn't
      // need this because rendering happens in the main process and goes through
      // Vite's invalidated server module graph (plugin.server.ts hotUpdate).
      const isCssFile = isInModuleBase &&
        (file.endsWith('.css') || file.endsWith('.scss') || file.endsWith('.sass') || file.endsWith('.less'));

      // Skip client components — let @vitejs/plugin-react handle them with Fast Refresh
      const isClientFile = isSourceFile && (() => {
        // Check filename pattern (.client.tsx, etc.) — matches isClientComponentByName
        if (/\.client\.(js|ts|jsx|tsx)$/.test(file)) return true;
        try {
          const head = readFileSync(file, 'utf-8').slice(0, 200);
          return /^\s*["']use client["']/.test(head.split('\n')[0]);
        } catch { return false; }
      })();

      const isServerFile = isSourceFile && !isClientFile;
      const shouldInvalidateWorker = isServerFile || isCssFile;

      if (shouldInvalidateWorker && hmrHandler) {
        isProcessingHmr = true;

        try {
          server.config.logger.info(`[vite-plugin-react-server] File changed: ${file}, sending HMR update...`);

          // CRITICAL: Send HMR_UPDATE message to worker to invalidate modules
          // This clears component caches, but Node.js's ES module cache persists
          hmrHandler.sendHmrUpdate(file);

          // Notify the browser to refetch the RSC stream. In dev:rsc the
          // equivalent send lives in plugin.server.ts's hmrPlugin, which only
          // runs under the react-server orchestrator. dev:ssr (this plugin)
          // never loads that orchestrator, so without sending the event here
          // the worker invalidates correctly but the browser keeps showing
          // pre-edit content — `useRscHmr` listens for this event and only
          // refetches on receipt.
          server.ws.send({
            type: "custom",
            event: "vite-plugin-react-server:server-component-update",
            data: { file: normalizedFile, path: file },
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
            // This is expected if hotUpdate fires before the first request
            server.config.logger.warn(`[vite-plugin-react-server] Restart function not available yet - worker will be created on next request`);
            setTimeout(() => {
              isProcessingHmr = false;
            }, 100);
          }
        } catch (error) {
          server.config.logger.error(`[vite-plugin-react-server] Error handling HMR update: ${error}`);
          isProcessingHmr = false;
        }
      } else if (shouldInvalidateWorker && !hmrHandler) {
        server.config.logger.warn(`[vite-plugin-react-server] Source file changed but HMR handler not available yet: ${file}`);
      }
      
      // Don't suppress — plugin.server.ts hotUpdate handles page reload prevention
    },
  };
};
