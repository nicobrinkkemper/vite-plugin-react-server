import { performance } from "node:perf_hooks";
import {
  type Manifest,
  createLogger,
  type Logger,
  type ResolvedConfig,
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
    let resolvedConfig: ResolvedConfig;

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
      config(config, configEnv) {
        // For react-server condition, always default to SSR=true unless explicitly overridden
        // This ensures server builds work correctly even if other plugins set build.ssr=false
        if (typeof config.build?.ssr === "boolean" && config.build.ssr === false) {
          // In a client environment, build.ssr=false is expected, so just skip this plugin
          return config;
        }
        
        // Set up moduleID function if not already set
        if (typeof currentUserOptions.moduleID !== "function") {
          currentUserOptions.moduleID = createDefaultModuleID(
            currentUserOptions,
            configEnv,
            currentUserOptions.loader?.mode
          );
        }
        
        // Set up logger if not already set
        if (!logger) {
          logger = config.customLogger || createLogger();
        }
        
        // The environment plugin handles auto-discovery and input configuration
        // This plugin now focuses on server-specific functionality
        return config; 
      },
      async configResolved(_resolvedConfig) {
        resolvedConfig = _resolvedConfig;
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
          hmrChannel: hmrChannel || new MessageChannel(),
          serverManifest: serverManifest,
          resolvedConfig: resolvedConfig as ResolvedConfig,
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

