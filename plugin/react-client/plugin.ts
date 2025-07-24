import { createLogger, type ConfigEnv, type ResolvedConfig, type Logger } from "vite";
import type {
  AutoDiscoveredFiles,
  ResolvedUserConfig,
  VitePluginFn,
} from "../types.js";
import { resolveOptions } from "../config/resolveOptions.js";
import { resolveUserConfig } from "../config/resolveUserConfig.js";
import { resolveAutoDiscover } from "../config/autoDiscover/resolveAutoDiscover.js";
import { configureWorkerRequestHandler } from "./configureWorkerRequestHandler.js";
import { configurePreviewServer } from "../react-static/configurePreviewServer.js";
import { MessageChannel } from "node:worker_threads";
import { handleError } from "../error/handleError.js";
import { logError } from "../error/logError.js";

export const reactClientPlugin: VitePluginFn = function _reactClientPlugin(
  options
) {
  let userConfig: ResolvedUserConfig;
  let configEnv: ConfigEnv;
  let root: string;
  let autoDiscoveredFiles: AutoDiscoveredFiles;
  let hmrChannel: MessageChannel | null = null;
  let currentUserOptions: any;
  let resolvedConfig: ResolvedConfig | null = null;
  let logger: Logger;

  // Initial options resolution
  const resolvedOptions = resolveOptions(options);
  if (resolvedOptions.type === "error") {
    throw resolvedOptions.error;
  }
  currentUserOptions = resolvedOptions.userOptions;
  root = currentUserOptions.projectRoot;

  return {
    name: "vite:plugin-react-server/client",

    async config(config, viteConfigEnv) {
      configEnv = viteConfigEnv;
      if (
        typeof config.root === "string" &&
        config.root !== root &&
        config.root !== process.cwd() &&
        config.root !== ""
      ) {
        root = config.root;
        currentUserOptions.projectRoot = root;
      }
      const logger = config.customLogger || createLogger();
      const autoDiscoverResult = await resolveAutoDiscover({
        config,
        configEnv,
        userOptions: currentUserOptions,
        condition: "react-client",
        logger,
      });
      if (autoDiscoverResult.type === "error") {
        const panicError = handleError({
          error: autoDiscoverResult.error,
          logger,
          panicThreshold: currentUserOptions.panicThreshold
        });
        if (panicError != null) {
          throw panicError;
        }
        return;
      }
      autoDiscoveredFiles = autoDiscoverResult.autoDiscoveredFiles;
      if (!autoDiscoveredFiles) {
        throw new Error("Failed to find autoDiscoveredFiles");
      }

      const resolvedConfig = resolveUserConfig({
        condition: "react-client",
        config,
        configEnv,
        userOptions: currentUserOptions,
        autoDiscoveredFiles,
      });

      if (resolvedConfig.type === "error") {
        throw resolvedConfig.error;
      }

      userConfig = resolvedConfig.userConfig;
      return userConfig;
    },
    configResolved(viteResolvedConfig) {
      if(currentUserOptions.verbose) {
        logger?.info("configResolved");
      }
      resolvedConfig = viteResolvedConfig;
      logger = resolvedConfig.customLogger || resolvedConfig.logger;
    },
    async configurePreviewServer(server) {
      await configurePreviewServer({
        server,
        userOptions: currentUserOptions,
      });
    },
    async writeBundle(options, bundle) {
      if (currentUserOptions.onEvent) {
        currentUserOptions.onEvent({
          type: `build.writeBundle.${
            userConfig.build.ssr ? "client" : "static-client"
          }`,
          data: {
            pages: [...autoDiscoveredFiles.routeMap.keys()],
            options,
            bundle,
          },
        });
      }
    },
    // setup dev server
    configureServer(server) {
      // Create HMR message channel
      hmrChannel = new MessageChannel();
      
      // Set up restart listener to re-resolve options when config changes
      server.ws.on('restart', () => {
        const logger = server.config.customLogger || server.config.logger;
        logger?.info('[vite-plugin-react-server] Server restarting, re-resolving options...');
        
        // Re-resolve options with forceResolve flag
        const newResolvedOptions = resolveOptions(options, true);
        if (newResolvedOptions.type === "error") {
          logError(newResolvedOptions.error, logger);
          return;
        }
        
        // Update current options
        currentUserOptions = newResolvedOptions.userOptions;
        
        logger?.info('[vite-plugin-react-server] Options re-resolved successfully');
      });

      configureWorkerRequestHandler({
        server,
        autoDiscoveredFiles,
        userOptions: currentUserOptions,
        hmrChannel,
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
}
