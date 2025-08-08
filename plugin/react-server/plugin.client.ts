import { performance } from "node:perf_hooks";
import {

  type UserConfig,
  type Manifest,
  createLogger,
  type Logger,
  type ResolvedConfig,
} from "vite";
import { resolveOptions } from "../config/resolveOptions.js";
import { resolveUserConfig } from "../config/resolveUserConfig.js";
import type {
  BuildTiming,
  VitePluginFn,
  AutoDiscoveredFiles,
} from "../types.js";
import { resolveAutoDiscover } from "../config/autoDiscover/resolveAutoDiscover.js";
import { configureReactServer } from "../dev-server/configureReactServer.client.js";
import { getBundleManifest } from "../helpers/getBundleManifest.js";
import { createDefaultModuleID } from "../config/createModuleID.js";
import { handleError } from "../error/handleError.js";
import { assertNonReactServer } from "../config/getCondition.js";
import { setWorker } from "../helpers/workerManager.js";
import { MessageChannel } from "node:worker_threads";
assertNonReactServer()

export const reactServerPlugin: VitePluginFn = function _reactServerPluginForClient(
  options
) {
  const timing: BuildTiming = {
    start: performance.now(),
  };


  let autoDiscoveredFiles: AutoDiscoveredFiles;
  let logger: Logger;
  let resolvedConfig: ResolvedConfig;

  const resolvedOptions = resolveOptions(options);
  if (resolvedOptions.type === "error") {
    throw resolvedOptions.error;
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
    configResolved(_resolvedConfig) {
      resolvedConfig = _resolvedConfig;
      timing.configResolved = performance.now();
    },

    
    // setup dev server
    configureServer(server) {
      if(currentUserOptions.verbose) {
        logger?.info("configureServer");
      }
      
      // Create HMR message channel
      hmrChannel = new MessageChannel();
      
      // Set up restart listener to re-resolve options when config changes
      server.ws.on('restart', () => {
        const logger = server.config.customLogger || server.config.logger;
        logger?.info('[vite-plugin-react-server] Server restarting, re-resolving options...');
        
        // Re-resolve options with forceResolve flag
        const newResolvedOptions = resolveOptions(options, true, logger);
        if (newResolvedOptions.type === "error") {
          const panicError = handleError({
            error: newResolvedOptions.error,
            logger,
            panicThreshold: currentUserOptions.panicThreshold,
            context: "restart(config(options))",
          });
          if (panicError != null) {
            throw panicError;
          }
          return;
        }
        
        // Update current options
        currentUserOptions = newResolvedOptions.userOptions;
        
        logger?.info('[vite-plugin-react-server] Options re-resolved successfully');
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
    async config(config, configEnv): Promise<UserConfig> {
      // Create the proper moduleID function now that we have ConfigEnv
      try {
        if (typeof currentUserOptions.moduleID !== "function") {
          currentUserOptions.moduleID = createDefaultModuleID(
            currentUserOptions,
            configEnv,
            currentUserOptions.loader?.mode
          );
        }
        if (!logger) {
          logger = config.customLogger || createLogger();
        }
        const autoDiscoverResult = await resolveAutoDiscover({
          config,
          configEnv,
          userOptions: currentUserOptions,
          condition: "react-server",
          logger,
        });
        if (autoDiscoverResult.type === "error") {
          throw (
            handleError({
              error: autoDiscoverResult.error,
              logger,
              context: "config(autoDiscover)",
              panicThreshold: currentUserOptions.panicThreshold,
            }) ?? autoDiscoverResult.error
          );
        }
        autoDiscoveredFiles = autoDiscoverResult.autoDiscoveredFiles;

        const resolveUserConfigResult = resolveUserConfig({
          condition: "react-server",
          config,
          configEnv,
          userOptions: currentUserOptions,
          autoDiscoveredFiles,
        });

        if (resolveUserConfigResult.type === "error") {
          throw (
            handleError({
              error: resolveUserConfigResult.error,
              logger,
              context: "config(resolveUserConfig)",
              panicThreshold: currentUserOptions.panicThreshold,
            }) ?? resolveUserConfigResult.error
          );
        }

        return resolveUserConfigResult.userConfig;
      } catch (error) {
        throw (
          handleError({
            error,
            logger,
            context: "config(config)",
            panicThreshold: currentUserOptions.panicThreshold,
          }) ?? error
        );
      }
    },
    async writeBundle(options, bundle) {
      if (currentUserOptions.onEvent) {
        try {
          currentUserOptions.onEvent({
            type: "build.writeBundle.server",
            data: {
              pages: Array.from(autoDiscoveredFiles?.urlMap.keys() ?? []),
              options,
              bundle,
            },
          });
        } catch (error) {
          throw (
            handleError({
              error,
              logger,
              context: "onEvent(build.writeBundle.server)",
              panicThreshold: currentUserOptions.panicThreshold,
            }) ?? error
          );
        }
      }
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
        const isPageFile = currentUserOptions.autoDiscover.modulePattern.test(file);
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
