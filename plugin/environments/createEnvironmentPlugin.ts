import type { Plugin, UserConfig } from "vite";
import type { VitePluginFn } from "../types.js";
import { createTransformerPlugin } from "../transformer/createTransformerPlugin.js";

import { resolveAutoDiscover } from "../config/autoDiscover/resolveAutoDiscover.js";
import { resolveUserConfig } from "../config/resolveUserConfig.js";
import { resolveOptions } from "../config/resolveOptions.js";
import { handleError } from "../error/handleError.js";
import { createDefaultModuleID } from "../config/createModuleID.js";
import { createLogger } from "vite";
import { join } from "node:path";
import { DEFAULT_LOADER_CONFIG } from "../config/defaults.js";

/**
 * Creates a plugin that ensures consistent hash generation across environments
 * by using the original source file content as the basis for hash generation.

*/
// Note: Path normalization should be handled in the file naming functions, not in writeBundle

/**
 * Environment Configuration Plugin
 *
 * This plugin configures Vite Environment API environments for React Server Components.
 * It's separate from the env plugin which handles process environment variables.
 *
 * Environment mapping:
 * - client (Vite client = browser) → dist/client (React client components - real implementations)
 * - ssr (Vite SSR = SSR-safe) → dist/static (SSR-compatible static files)
 * - server (custom) → dist/server (React server components with registerClientReference)
 */
export const createEnvironmentPlugin: VitePluginFn = (options): Plugin => {
  const environmentPlugin: Plugin = {
    name: "vite:plugin-react-server/environments",
    enforce: "pre",

    async config(config: UserConfig, configEnv) {
      // Resolve plugin options
      const resolvedOptionsResult = resolveOptions(options);
      if (resolvedOptionsResult.type === "error") {
        throw resolvedOptionsResult.error;
      }
      const userOptions = resolvedOptionsResult.userOptions;

      // Add transformer plugins at the Vite level with proper environment filtering
      if (!config.plugins) {
        config.plugins = [];
      }

      // Add single dynamic transformer that adapts based on current environment
      // Check if transformer plugin already exists to prevent duplicates
      const existingTransformer = config.plugins?.find(
        (plugin) =>
          plugin &&
          typeof plugin === "object" &&
          "name" in plugin &&
          plugin.name === "vite-plugin-react-server:transform-dynamic"
      );
      // todo: support legacy build
      // const isLegacyBuild = userOptions.strategy?.legacyBuilder && !config?.builder;
      if (!existingTransformer) {
        config.plugins.push(
          createTransformerPlugin({
            name: "dynamic",
            defaultEnvironment: "client", // Default fallback, will be overridden by actual environment
            allowedEnvironments: ["client", "ssr", "server"], // Allow all environments
          })(options)
        );
      }

      // Note: Hash coordination is handled by the sequential build approach
      // Each environment will use the manifest from the previous build

      // Set up logger and moduleID
      const logger = config.customLogger || createLogger();
      if (typeof userOptions.moduleID !== "function") {
        userOptions.moduleID = createDefaultModuleID(
          userOptions,
          configEnv,
          userOptions.loader?.mode
        );
      }
      // Always override the moduleID function to ensure it has the forTransformer logic
      if (!userOptions.loader) {
        userOptions.loader = DEFAULT_LOADER_CONFIG;
      }
      userOptions.loader.moduleID = createDefaultModuleID(
        userOptions,
        configEnv,
        userOptions.loader?.mode
      );

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

      // Define environment configurations
      const allEnvironmentConfigs = [
        {
          name: "client",
          condition: "react-client" as const,
          ssr: false,
          outDir: join(userOptions.build.outDir, userOptions.build.static),
        },
        {
          name: "ssr",
          condition: "react-client" as const,
          ssr: true,
          outDir: join(userOptions.build.outDir, userOptions.build.client),
        },
        {
          name: "server",
          condition: "react-server" as const,
          ssr: true,
          outDir: join(userOptions.build.outDir, userOptions.build.server),
        },
      ];

      // Filter environments based on availableEnvironments from orchestrator

      const availableEnvironments = (userOptions as any)
        .availableEnvironments || ["client", "ssr", "server"];

      const environmentConfigs = allEnvironmentConfigs.filter((config) =>
        availableEnvironments.includes(config.name)
      );


      // Resolve all environment configurations using resolveUserConfig
      const environments: Record<string, import("vite").EnvironmentOptions> =
        {};

      // Sort environments to process static first (to establish hashes)
      // Use the environment configs as-is
      const sortedEnvConfigs = environmentConfigs;

      for (const envConfig of sortedEnvConfigs) {
        const configResult = resolveUserConfig({
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
            throw new Error(
              `Cannot continue without ${envConfig.name} environment configuration`
            );
          }
        }

        // Map the resolved user config to Environment API compatible options
        const userConfig = configResult.userConfig;

        // Log the rollup inputs for this environment (only in verbose mode)
        if (userOptions.verbose) {
          logger?.info(
            `${envConfig.name} environment rollup inputs: ${JSON.stringify(
              userConfig.build.rollupOptions.input,
              null,
              2
            )}`
          );
          logger?.info(
            `${
              envConfig.name
            } environment output preserveModulesRoot: ${JSON.stringify(
              userConfig.build.rollupOptions.output,
              null,
              2
            )}`
          );
        }

        // Debug: Log what resolveUserConfig provided
        if (userOptions.verbose) {
          logger?.info(
            `${envConfig.name} userConfig.resolve: ${JSON.stringify(
              userConfig.resolve,
              null,
              2
            )}`
          );
          logger?.info(
            `${
              envConfig.name
            } userConfig.build.rollupOptions.external: ${JSON.stringify(
              userConfig.build.rollupOptions.external,
              null,
              2
            )}`
          );
        }
        // detect if legacy build or not
        const legacyBuild = userOptions.strategy?.legacyBuilder && !config?.builder;
        const implicitSsr =
          userOptions.strategy?.mainThreadCondition === "react-server" &&
          userOptions.strategy?.legacyBuilder;
        // this follows vite's logic for legacy builds
        const implicitViteBuildName =
          userOptions.strategy?.legacyBuilder && !config.build?.ssr
            ? "client"
            : "ssr";
        const consumer = legacyBuild
          ? implicitViteBuildName === "ssr"
            ? "server"
            : "client"
          : envConfig.name === "server" || envConfig.name === "ssr"
          ? "server"
          : "client";

        // Note: Path normalization should be handled in the file naming functions
        environments[envConfig.name] = {
          keepProcessEnv: envConfig.name === "server" ? true : false,
          define: userConfig.define,
          consumer: consumer,
          resolve: {
            ...userConfig.resolve,
            // IMPORTANT: Map externals from resolveUserConfig (rollupOptions.external) to Environment API format
            // In Environment API, externals go in resolve.external, not build.rollupOptions.external
            external: Array.isArray(userConfig.build.rollupOptions.external)
              ? userConfig.build.rollupOptions.external.filter(
                  (item): item is string => typeof item === "string"
                )
              : [],
          },
          build: {
            ...userConfig.build,
            ssr:
              envConfig.name === "server"
                ? true
                : legacyBuild
                ? implicitSsr
                : envConfig.name === "ssr",
            target: userConfig.build.target,
            // Remove externals from rollupOptions since they should be in resolve.external for Environment API
            rollupOptions: {
              ...userConfig.build.rollupOptions,
              external: undefined, // Remove external from rollupOptions, it's now in resolve.external
              // Set preserveModules in the output configuration, not at the top level
              output: (() => {
                const output = userConfig.build.rollupOptions.output;
                if (userOptions.verbose) {
                  console.log(`[DEBUG] ${envConfig.name} environment output config:`, JSON.stringify(output, null, 2));
                  console.log(`[DEBUG] ${envConfig.name} output type:`, Array.isArray(output) ? 'array' : typeof output);
                  if (Array.isArray(output)) {
                    console.log(`[DEBUG] ${envConfig.name} output array length:`, output.length);
                    output.forEach((item, index) => {
                      console.log(`[DEBUG] ${envConfig.name} output[${index}]:`, JSON.stringify(item, null, 2));
                    });
                  }
                }
                
                // Handle array output configuration - extract the plugin output that contains preserveModulesRoot
                if (Array.isArray(output)) {
                  const pluginOutput = output.find(o => o && typeof o === 'object' && 'preserveModulesRoot' in o);
                  if (pluginOutput) {
                    if (userOptions.verbose) {
                      console.log(`[DEBUG] ${envConfig.name} found pluginOutput with preserveModulesRoot:`, JSON.stringify(pluginOutput, null, 2));
                    }
                    return pluginOutput;
                  }
                  // If no pluginOutput found, use the first output configuration
                  if (output.length > 0) {
                    return output[0];
                  }
                }
                
                // Ensure preserveModulesRoot is always present in the output configuration
                if (output && typeof output === 'object' && !Array.isArray(output)) {
                  // Check if the property exists in the object (not just checking the value)
                  const hasPreserveModulesRoot = 'preserveModulesRoot' in output;
                  if (userOptions.verbose) {
                    console.log(`[DEBUG] ${envConfig.name} hasPreserveModulesRoot:`, hasPreserveModulesRoot);
                  }
                  
                  if (hasPreserveModulesRoot) {
                    // Property exists, return the object with preserveModules: true to enable the feature
                    return { ...output, preserveModules: true };
                  } else {
                    // Property missing, add it based on user options
                    if (userOptions.verbose) {
                      console.log(`[DEBUG] ${envConfig.name} output missing preserveModulesRoot, adding from userOptions`);
                    }
                    const preserveModulesRootString = userOptions.build.preserveModulesRoot === false
                      ? userOptions.moduleBase
                      : undefined;
                    return { ...output, preserveModulesRoot: preserveModulesRootString };
                  }
                }
                
                return output;
              })(),
            },
          },
        };
      }

      // Return the configuration with all environments
      return {
        root: userOptions.projectRoot,
        ...config,
        environments,
      };
    },
  };

  return environmentPlugin;
};
