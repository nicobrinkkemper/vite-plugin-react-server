import {
  createLogger,
  type ConfigEnv,
  type ResolvedConfig,
  type Logger,
} from "vite";
import type {
  AutoDiscoveredFiles,
  ResolvedUserConfig,
  VitePluginFn,
} from "../types.js";
import { resolveOptions } from "../config/resolveOptions.js";
import { resolveUserConfig } from "../config/resolveUserConfig.js";
import { resolveAutoDiscover } from "../config/autoDiscover/resolveAutoDiscover.js";
import { handleError } from "../error/handleError.js";
import { assertNonReactServer } from "../config/getCondition.js";

assertNonReactServer();

/**
 * Main entry for `react-client` behavior. This plugin is imported when the plugin is imported from the main
 * entrypoint and the condition is not `react-server`.
 *
 * This plugin is responsible for:
 *  Dev mode under non-react-server conditions:
 * - Disabled, user react-server/plugin.client.ts instead
 * Build mode under non-react-server conditions:
 * - Configure the config for the client boundary build
 * @param options
 * @returns
 */
export const reactClientPlugin: VitePluginFn = function _reactClientPlugin(
  options
) {
  let userConfig: ResolvedUserConfig;
  let configEnv: ConfigEnv;
  let autoDiscoveredFiles: AutoDiscoveredFiles;

  let resolvedConfig: ResolvedConfig | null = null;
  let logger: Logger;
  let implicitSsr: boolean | undefined = undefined;

  // Initial options resolution
  const resolvedOptions = resolveOptions(options);
  if (resolvedOptions.type === "error") {
    if (resolvedOptions.error != null) {
      throw resolvedOptions.error;
    }
    throw new Error("Failed to resolve options");
  }
  const currentUserOptions = resolvedOptions.userOptions;

  return {
    name: "vite:plugin-react-server/client",
    enforce: "post",
    async config(config, viteConfigEnv) {
      // Debug logging removed for performance
      configEnv = viteConfigEnv;
      if (configEnv.command !== "build") {
        return;
      }
      
      // Debug logging removed for performance
      
      if(typeof config?.build?.ssr === "boolean" || typeof config?.build?.ssr === "string") {
        implicitSsr = config?.build?.ssr === "true" || config?.build?.ssr === true;
        // Debug logging removed for performance
      } else if(implicitSsr === undefined) {
        implicitSsr = configEnv.isSsrBuild;
        // Debug logging removed for performance
      }
      
      // Debug logging removed for performance
      const logger = config.customLogger || createLogger();
      const autoDiscoverResult = await resolveAutoDiscover({
        config,
        configEnv,
        userOptions: currentUserOptions,
        logger,
      });
      if (autoDiscoverResult.type === "error") {
        const panicError = handleError({
          error: autoDiscoverResult.error,
          logger,
          panicThreshold: currentUserOptions.panicThreshold,
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
        userOptions: currentUserOptions,
        autoDiscoveredFiles,
        ssr: implicitSsr,
      });

      if (resolvedConfig.type === "error") {
        if (resolvedConfig.error != null) {
          throw resolvedConfig.error;
        }
        throw new Error("Failed to resolve config");
      }

      userConfig = resolvedConfig.userConfig;
      return userConfig;
    },
    configResolved(viteResolvedConfig) {
      if (currentUserOptions.verbose) {
        logger?.info("configResolved");
      }
      resolvedConfig = viteResolvedConfig;
      logger = resolvedConfig.customLogger || resolvedConfig.logger;
    },
  };
};
