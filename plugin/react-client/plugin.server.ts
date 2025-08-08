import { createLogger, type ConfigEnv } from "vite";
import type {
  AutoDiscoveredFiles,
  ResolvedUserConfig,
  VitePluginFn,
} from "../types.js";
import { resolveOptions } from "../config/resolveOptions.js";
import { resolveUserConfig } from "../config/resolveUserConfig.js";
import { resolveAutoDiscover } from "../config/autoDiscover/resolveAutoDiscover.js";
import { handleError } from "../error/handleError.js";
import { assertReactServer } from "../config/getCondition.js";

assertReactServer();  

/**
 * Semantic entry for `react-client` build behavior under the `react-server`  condition.
 * - Only used whe imported directly and under the `react-server` condition.
 * 
 * This plugin is responsible for:
 *  Dev mode under non-react-server conditions:
 *   - Disabled, use /server/plugin.server.ts instead
 *  Build:
 *  - Configure the config for the client boundary build
 * @param options 
 * @returns 
 */
export const reactClientPlugin: VitePluginFn = function _reactClientPlugin(
  options
) {
  let userConfig: ResolvedUserConfig;
  let configEnv: ConfigEnv;
  let autoDiscoveredFiles: AutoDiscoveredFiles;

  // Initial options resolution
  const resolvedOptions = resolveOptions(options);
  if (resolvedOptions.type === "error") {
    throw resolvedOptions.error;
  }
  const { userOptions } = resolvedOptions;

  return {
    name: "vite:plugin-react-server/client",

    async config(config, viteConfigEnv) {
      configEnv = viteConfigEnv;
    
      const logger = config.customLogger || createLogger();
      const autoDiscoverResult = await resolveAutoDiscover({
        config,
        configEnv,
        userOptions: userOptions,
        condition: "react-client",
        logger,
      });
      if (autoDiscoverResult.type === "error") {
        const panicError = handleError({
          error: autoDiscoverResult.error,
          logger,
          panicThreshold: userOptions.panicThreshold,
          context: "config(autoDiscover)",
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
        userOptions: userOptions,
        autoDiscoveredFiles,
      });

      if (resolvedConfig.type === "error") {
        throw resolvedConfig.error;
      }

      userConfig = resolvedConfig.userConfig;
      return userConfig;
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
  };
}
