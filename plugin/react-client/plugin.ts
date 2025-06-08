import { type ConfigEnv, type Plugin } from "vite";
import type {
  AutoDiscoveredFiles,
  InlineCssOpt,
  PagePropOpt,
  ResolvedUserConfig,
  StreamPluginOptions,
} from "../types.js";
import { resolveOptions } from "../config/resolveOptions.js";
import { resolveUserConfig } from "../config/resolveUserConfig.js";
import { resolveAutoDiscover } from "../config/autoDiscover/resolveAutoDiscover.js";
import { configureWorkerRequestHandler } from "./configureWorkerRequestHandler.js";
import { configurePreviewServer } from "../react-static/configurePreviewServer.js";
import { MessageChannel } from "node:worker_threads";

export function reactClientPlugin<
  T extends PagePropOpt = PagePropOpt,
  InlineCSS extends InlineCssOpt = InlineCssOpt
>(options: StreamPluginOptions<T, InlineCSS>): Plugin {
  let userConfig: ResolvedUserConfig;
  let configEnv: ConfigEnv;
  let root: string;
  let autoDiscoveredFiles: AutoDiscoveredFiles;
  let hmrChannel: MessageChannel | null = null;

  const resolvedOptions = resolveOptions(options);
  if (resolvedOptions.type === "error") {
    throw resolvedOptions.error;
  }
  const userOptions = resolvedOptions.userOptions;
  root = userOptions.projectRoot;

  return {
    name: "vite:react-client",

    async config(config, viteConfigEnv) {
      configEnv = viteConfigEnv;
      if (
        typeof config.root === "string" &&
        config.root !== root &&
        config.root !== process.cwd() &&
        config.root !== ""
      ) {
        root = config.root;
        userOptions.projectRoot = root;
      }

      const autoDiscoverResult = await resolveAutoDiscover({
        config,
        configEnv,
        userOptions,
        condition: "react-client",
      });
      if (autoDiscoverResult.type === "error") {
        throw autoDiscoverResult.error;
      }
      autoDiscoveredFiles = autoDiscoverResult.autoDiscoveredFiles;

      const resolvedConfig = resolveUserConfig<T, InlineCSS>({
        condition: "react-client",
        config,
        configEnv,
        userOptions,
        autoDiscoveredFiles,
      });

      if (resolvedConfig.type === "error") {
        throw resolvedConfig.error;
      }

      userConfig = resolvedConfig.userConfig;
      return userConfig;
    },
    async configurePreviewServer(server) {
      await configurePreviewServer<T, InlineCSS>({
        server,
        userOptions,
      });
    },
    async writeBundle(options, bundle) {
      if (userOptions.onEvent) {
        userOptions.onEvent({
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
    async configureServer(server) {
      // Create HMR message channel
      hmrChannel = new MessageChannel();
      await configureWorkerRequestHandler<T, InlineCSS>({
        server,
        autoDiscoveredFiles,
        userOptions,
        hmrChannel,
        onMetrics: userOptions.onMetrics,
      });
    },

    async handleHotUpdate({ file, server, timestamp, ...ctx }) {
      try {
        // Check if the file is a page or props file
        const isPageFile = userOptions.autoDiscover.modulePattern(file);
        if (!isPageFile) return;

        // Get the route for this file
        const [, value] = userOptions.normalizer(file);

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
