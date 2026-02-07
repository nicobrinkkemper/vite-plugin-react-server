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
  let implicitSsr: boolean | undefined = undefined;
  // Initial options resolution
  const resolvedOptions = resolveOptions(options);
  if (resolvedOptions.type === "error") {
    if(resolvedOptions.error != null) {
      throw resolvedOptions.error;
    }
    throw new Error("React client plugin failed to resolve options");
  }
  const { userOptions } = resolvedOptions;

  return {
    name: "vite:plugin-react-server/client",
    applyToEnvironment(env) {
      // Only apply this plugin in the client environment
      const envName = (env?.name || "").toLowerCase();
      if(envName === "client" || envName === "ssr") {
        return true;
      }
      return false;
    },
    async config(config, viteConfigEnv) {
      configEnv = viteConfigEnv;
      if(configEnv.command !== "build") {
        return;
      }
      if(typeof config?.build?.ssr === "boolean" || typeof config?.build?.ssr === "string") {
        implicitSsr = config?.build?.ssr === "true" || config?.build?.ssr === true;
      } else if(implicitSsr === undefined) {
        implicitSsr = configEnv.isSsrBuild;
      }
    
      const logger = config.customLogger || createLogger();
      const autoDiscoverResult = await resolveAutoDiscover({
        config,
        configEnv,
        userOptions: userOptions,
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
        throw new Error("Failed to resolve autoDiscoveredFiles");
      }
      autoDiscoveredFiles = autoDiscoverResult.autoDiscoveredFiles;
      

      const resolvedConfig = resolveUserConfig({
        condition: "react-client",
        config,
        configEnv,
        userOptions: userOptions,
        autoDiscoveredFiles,
        ssr: implicitSsr,
      });

      if (resolvedConfig.type === "error") {
        if(resolvedConfig.error != null) {
          throw resolvedConfig.error;
        }
        throw new Error("Failed to resolve config");
      }


      userConfig = resolvedConfig.userConfig;
      return userConfig;
    },
  };
}
