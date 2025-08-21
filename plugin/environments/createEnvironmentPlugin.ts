import type { Plugin, UserConfig } from "vite";
import type { VitePluginFn } from "../types.js";
import { resolveAutoDiscover } from "../config/autoDiscover/resolveAutoDiscover.js";
import { resolveEnvironmentConfig } from "./resolveEnvironmentConfig.js";
import { resolveOptions } from "../config/resolveOptions.js";
import { handleError } from "../error/handleError.js";
import { createDefaultModuleID } from "../config/createModuleID.js";
import { createLogger } from "vite";


/**
 * Environment Configuration Plugin
 *
 * This plugin configures Vite Environment API environments for React Server Components.
 * It's separate from the env plugin which handles process environment variables.
 *
 * Environment mapping:
 * - client (Vite client = browser) → dist/static (static site generation)
 * - ssr (Vite SSR = client boundary) → dist/client (React client boundary code)
 * - server (custom) → dist/server (React server components)
 */
export const createEnvironmentPlugin: VitePluginFn = (options): Plugin => {
  return {
    name: "vite:plugin-react-server/environments",
    enforce: "pre",

    async config(config: UserConfig, configEnv) {
      // Resolve plugin options
      const resolvedOptionsResult = resolveOptions(options);
      if (resolvedOptionsResult.type === "error") {
        throw resolvedOptionsResult.error;
      }
      const userOptions = resolvedOptionsResult.userOptions;
      
      // Set up logger and moduleID
      const logger = config.customLogger || createLogger();
      if (typeof userOptions.moduleID !== "function") {
        userOptions.moduleID = createDefaultModuleID(
          userOptions,
          configEnv,
          userOptions.loader?.mode
        );
      }

      // Run auto-discovery once to get all files - we don't need separate calls since
      // the file discovery process is identical, only the organization differs
      const autoDiscoverResult = await resolveAutoDiscover({
        config,
        configEnv,
        userOptions,
        logger,
      });

      if (autoDiscoverResult.type === "error") {
        const panicError = handleError({
          error: autoDiscoverResult.error,
          logger,
          context: "createEnvironmentPlugin(autoDiscover)",
          panicThreshold: userOptions.panicThreshold,
          critical: true, // Auto-discovery is critical for environment setup
        });
        if (panicError != null) {
          throw panicError;
        } else {
          // If handleError returns null but this is critical, we can't continue
          throw new Error("Cannot continue without auto-discovery");
        }
      }

      // Get the auto-discovered files (safe to access since we checked for errors above)
      const autoDiscoveredFiles = autoDiscoverResult.autoDiscoveredFiles!;

      logger?.info("Environment plugin resolved auto-discovery for all environments");

      // Define environment configurations
      const environmentConfigs = [
        { name: "client", condition: "react-client" as const, ssr: false },
        { name: "ssr", condition: "react-client" as const, ssr: true },
        { name: "server", condition: "react-server" as const, ssr: true },
      ];

      // Resolve all environment configurations
      const environments: Record<string, import("vite").EnvironmentOptions> = {};
      
      for (const envConfig of environmentConfigs) {
        const configResult = resolveEnvironmentConfig({
          condition: envConfig.condition,
          config,
          configEnv,
          userOptions,
          autoDiscoveredFiles,
          ssr: envConfig.ssr,
        });

        if (configResult.type === "error") {
          const panicError = handleError({
            error: configResult.error,
            logger,
            context: `createEnvironmentPlugin(${envConfig.name}Config)`,
            panicThreshold: userOptions.panicThreshold,
            critical: true,
          });
          if (panicError != null) {
            throw panicError;
          } else {
            throw new Error(`Cannot continue without ${envConfig.name} environment configuration`);
          }
        }

        environments[envConfig.name] = {
          build: configResult.environmentConfig,
        };
      }

      // Return the configuration with all environments
      return {
        ...config,
        environments,
      };
    },
  };
};
