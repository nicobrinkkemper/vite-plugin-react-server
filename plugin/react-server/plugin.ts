import { performance } from "node:perf_hooks";
import {
  type ResolvedConfig,
  type UserConfig,
  type ViteDevServer,
  type Manifest,
} from "vite";
import { resolveOptions } from "../config/resolveOptions.js";
import { resolveUserConfig } from "../config/resolveUserConfig.js";
import type {
  AutoDiscoveredFiles,
  BuildTiming,
  ReactStreamPluginFn,
  ReactStreamPluginMeta,
} from "../types.js";
import { resolveAutoDiscover } from "../config/autoDiscover/resolveAutoDiscover.js";
import { configureReactServer } from "./configureReactServer.js";
import { configurePreviewServer } from "../react-static/configurePreviewServer.js";
import { getBundleManifest } from "../helpers/getBundleManifest.js";
import { createDefaultModuleID } from "../config/createModuleID.js";

let resolvedConfig: ResolvedConfig | null = null;

export type ReactServerPluginFn = ReactStreamPluginFn<{
  meta: ReactStreamPluginMeta;
}>;

export const reactServerPlugin: ReactServerPluginFn =
  function _reactServerPlugin(options) {
    const timing: BuildTiming = {
      start: performance.now(),
    };

    let autoDiscoveredFiles: AutoDiscoveredFiles;
    let serverManifest: Manifest = {};

    const resolvedOptions = resolveOptions(options);
    if (resolvedOptions.type === "error") {
      throw resolvedOptions.error;
    }
    const userOptions = resolvedOptions.userOptions;

    return {
      name: "vite:react-stream-server",
      enforce: "post",
      api: {
        meta: { timing },
      },
      configResolved(_resolvedConfig) {
        resolvedConfig = _resolvedConfig;
        if (
          userOptions.projectRoot != resolvedConfig.root &&
          typeof userOptions.projectRoot === "string" &&
          userOptions.projectRoot !== ""
        ) {
          throw new Error(
            "[RSC] Project root is not the current working directory, please set projectRoot in your config.\n" +
              " projectRoot: " +
              userOptions.projectRoot +
              "\n" +
              " resolvedConfig.root: " +
              resolvedConfig.root
          );
        }
        timing.configResolved = performance.now();
      },

      async configurePreviewServer(server) {
        await configurePreviewServer({
          server,
          userOptions,
        });
      },
      async configureServer(server: ViteDevServer) {
        configureReactServer({
          server,
          autoDiscoveredFiles,
          userOptions,
          serverManifest,
        });
      },
      async config(config, configEnv): Promise<UserConfig> {
        // Create the proper moduleID function now that we have ConfigEnv
        if (typeof userOptions.moduleID !== "function") {
          userOptions.moduleID = createDefaultModuleID(
            userOptions,
            configEnv,
            userOptions.loader?.mode
          );
        }

        const autoDiscoverResult = await resolveAutoDiscover({
          config,
          configEnv,
          userOptions,
          condition: "react-server",
        });
        if (autoDiscoverResult.type === "error") {
          throw autoDiscoverResult.error;
        }
        autoDiscoveredFiles = autoDiscoverResult.autoDiscoveredFiles;

        const resolvedConfig = resolveUserConfig({
          condition: "react-server",
          config,
          configEnv,
          userOptions,
          autoDiscoveredFiles,
        });

        if (resolvedConfig.type === "error") {
          console.error(
            "[react-server-plugin] Failed to resolve config:",
            resolvedConfig.error
          );
          throw resolvedConfig.error;
        }

        return resolvedConfig.userConfig;
      },
      async writeBundle(options, bundle) {
        if (userOptions.onEvent) {
          userOptions.onEvent({
            type: "build.writeBundle.server",
            data: {
              pages: Array.from(autoDiscoveredFiles?.urlMap.keys() ?? []),
              options,
              bundle,
            },
          });
        }
      },
      async buildStart() {
        if (!timing.buildStart) {
          timing.buildStart = performance.now();
        } else if (userOptions.verbose) {
          console.log("Build already started");
        }
      },
      async generateBundle(_options, bundle) {
        // Create manifest entries for each chunk
        serverManifest = getBundleManifest<false>({
          bundle,
          normalizer: userOptions.normalizer,
        });
      },
      async handleHotUpdate({ file, server, timestamp, ...ctx }) {
        try {
          // Invalidate the module in Vite's cache for both client and SSR
          if (server.moduleGraph) {
            const mod = server.moduleGraph.getModuleById(file);
            if (mod) {
              // Invalidate the parent module which will handle both client and SSR
              server.moduleGraph.invalidateModule(
                mod,
                undefined,
                timestamp,
                true
              );

              // Force a reload of the module
              const newMod = await server.moduleGraph.ensureEntryFromUrl(
                file,
                false
              );
              if (newMod) {
                server.moduleGraph.invalidateModule(
                  newMod,
                  undefined,
                  timestamp,
                  true
                );
              }
            }
          }

          // Let Vite handle the HMR update
          return ctx.modules;
        } catch (error) {
          console.error("[react-server] HMR Error:", error);
          return ctx.modules;
        }
      },
    };
  };
