import { performance } from "node:perf_hooks";
import {
  type Manifest,
  createLogger,
  type Logger,
  type ResolvedConfig,
  type ConfigEnv,
} from "vite";
import { resolveOptions } from "../config/resolveOptions.js";
import type {
  BuildTiming,
  VitePluginFn,
  AutoDiscoveredFiles,
} from "../types.js";
import { configureReactServer } from "../dev-server/configureReactServer.client.js";
import { getBundleManifest } from "../helpers/getBundleManifest.js";
import { createDefaultModuleID } from "../config/createModuleID.js";
import { assertNonReactServer } from "../config/getCondition.js";
import { setWorker } from "../helpers/workerManager.js";
import { MessageChannel } from "node:worker_threads";
assertNonReactServer();

export const reactServerPlugin: VitePluginFn =
  function _reactServerPluginForClient(options) {
    const timing: BuildTiming = {
      start: performance.now(),
    };

    let autoDiscoveredFiles: AutoDiscoveredFiles;
    let logger: Logger;

    const resolvedOptions = resolveOptions(options);
    if (resolvedOptions.type === "error") {
      if (resolvedOptions.error != null) {
        throw resolvedOptions.error;
      }
      throw new Error("Failed to resolve options");
    }
    let currentUserOptions = resolvedOptions.userOptions;
    let hmrChannel: MessageChannel | null = null;
    let serverManifest: Manifest = {};
    let configEnv: ConfigEnv;
    return {
      name: "vite:plugin-react-server/rsc-worker-server",
      enforce: "post",
      api: {
        meta: { timing },
      },
      applyToEnvironment(partialEnvironment) {
        if (partialEnvironment.name === "server") {
          return true;
        }
        return false;
      },
      config(config, viteConfigEnv) {
        configEnv = viteConfigEnv;
        
        // Set up moduleID function if not already set
        if (typeof currentUserOptions.moduleID !== "function") {
          currentUserOptions.moduleID = createDefaultModuleID(
            currentUserOptions,
            viteConfigEnv,
            currentUserOptions.loader?.mode
          );
        }
        
        // The environment plugin handles auto-discovery and input configuration
        // This plugin now focuses on server-specific functionality
        return config; 
      },
      async configResolved(resolvedConfig) {
        
        // Set up logger if not already set
        if (!logger) {
          logger = resolvedConfig.customLogger || resolvedConfig.logger || createLogger();
        }
        resolvedConfig = resolvedConfig;
        timing.configResolved = performance.now();
        
        // Re-run auto-discovery for dev server purposes (environment plugin handles build)
        if (resolvedConfig.command === "serve") {
          const { resolveAutoDiscover } = await import("../config/autoDiscover/resolveAutoDiscover.js");
          const autoDiscoverResult = await resolveAutoDiscover({
            config: resolvedConfig as any,
            configEnv: { 
              command: resolvedConfig.command, 
              mode: resolvedConfig.mode, 
              isSsrBuild: Boolean(resolvedConfig.build.ssr) 
            },
            userOptions: currentUserOptions,
            logger,
          });

          if (autoDiscoverResult.type === "success") {
            autoDiscoveredFiles = autoDiscoverResult.autoDiscoveredFiles;
          }
        }
      },

      // setup dev server
      configureServer(server) {
        if (currentUserOptions.verbose) {
          logger?.info("configureServer");
        }

        // Create HMR message channel
        hmrChannel = new MessageChannel();

        // Set up restart listener to re-resolve options when config changes
        server.ws.on("restart", () => {
          const logger = server.config.customLogger || server.config.logger;
          logger?.info(
            "[vite-plugin-react-server] Server restarting, re-resolving options..."
          );

          // Re-resolve options with forceResolve flag
          const newResolvedOptions = resolveOptions(options, true, logger);
          if (newResolvedOptions.type === "error") {
            if (newResolvedOptions.error != null) {
              throw newResolvedOptions.error;
            }
            throw new Error("Failed to resolve options");
          }

          // Update current options
          currentUserOptions = newResolvedOptions.userOptions;

          logger?.info(
            "[vite-plugin-react-server] Options re-resolved successfully"
          );
        });

        // Use the new createReactWorkerServer to configure worker-based rendering
        configureReactServer({
          server,
          autoDiscoveredFiles,
          userOptions: currentUserOptions,
          configEnv: configEnv,
          hmrChannel: hmrChannel || new MessageChannel(),
          serverManifest: serverManifest,
          resolvedConfig: server.config,
          onWorkerCreated: (worker) => {
            setWorker(worker);
          },
        });
      },
      async generateBundle(_options, bundle) {
        // Create manifest entries for each chunk
        serverManifest = getBundleManifest<false>({
          bundle,
          normalizer: currentUserOptions.normalizer,
        });
      },

      async handleHotUpdate({ file, server, timestamp, ...ctx }) {
        try {
          // Check if the file is a page or props file
          const isPageFile =
            currentUserOptions.autoDiscover.modulePattern.test(file);
          if (!isPageFile) return;

          // Get the route for this file
          const [, value] = currentUserOptions.normalizer(file);

          // Find all routes affected by this file change
          const affectedRoutes = autoDiscoveredFiles.routeMap.get(value) || [];

          // Send HMR update directly to worker through MessageChannel
          if (hmrChannel?.port1) {
            hmrChannel.port1.postMessage({
              type: "HMR_UPDATE",
              path: file,
              timestamp,
              routes: affectedRoutes,
            });

            // Trigger a full page refresh for affected routes
            for (const route of affectedRoutes) {
              server.ws.send({
                type: "full-reload",
                path: route,
              });
            }
          }

          // Let Vite handle the HMR update
          return ctx.modules;
        } catch (error) {
          if (hmrChannel?.port1) {
            hmrChannel.port1.postMessage({
              type: "HMR_ERROR",
              path: file,
              error: error instanceof Error ? error.message : String(error),
            });
          }
          return ctx.modules;
        }
      },
    };
  };

