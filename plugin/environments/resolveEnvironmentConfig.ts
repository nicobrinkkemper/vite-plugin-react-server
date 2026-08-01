import type { UserConfig, BuildEnvironmentOptions, Rollup } from "vite";
import type { ResolvedUserOptions, AutoDiscoveredFiles } from "../types.js";
// Vite 8 swaps Rollup→Rolldown; source bundle types from Vite's version-agnostic Rollup namespace.
type OutputOptions = Rollup.OutputOptions;
import { isAbsolute, join, resolve } from "node:path";
import { createLogger } from "vite";
import { getEnvValue, setEnvValue } from "../env/getEnvKey.js";
import { effectiveModuleBaseURL } from "../config/effectiveModuleBaseURL.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { REACT_CONDITION, type ReactCondition } from "../config/getCondition.js";


// Cache for resolved environment configs to avoid recomputation
const stashedEnvironmentConfig: Record<string, BuildEnvironmentOptions | null> = {};
let originalConfig: UserConfig | null = null;



// TODO: Use virtual module approach with this.fileName in transformer

/**
 * KEY DIFFERENCES FROM resolveUserConfig:
 *
 * 1. Uses BuildEnvironmentOptions type instead of UserConfig
 * 2. Returns environment-specific configuration for Vite's Environment API
 * 3. Must set preserveModules: true for preserveModulesRoot to work
 * 4. Simplified input normalization (no moduleBase stripping in inputs)
 * 5. Environment-specific output directories and settings
 * 6. Uses Vite's natural module resolution and hashing
 * 
 * FUTURE ENHANCEMENTS:
 * - Could support callback functions for entryFileNames, chunkFileNames, and assetFileNames
 * - This would allow custom hash generation based on file content as discussed in
 *   https://github.com/rollup/rollup/issues/5362
 * - Would enable better cache busting and custom file naming strategies
 */

export type ResolveEnvironmentConfigProps = {
  condition: ReactCondition;
  config: UserConfig;
  userOptions: ResolvedUserOptions;
  autoDiscoveredFiles: AutoDiscoveredFiles;
  ssr?: boolean;
  forceResolve?: boolean;
};

export type ResolveEnvironmentConfigReturn =
  | { type: "success"; environmentConfig: BuildEnvironmentOptions }
  | { type: "error"; error: unknown };

export type ResolveEnvironmentConfigFn = (
  props: ResolveEnvironmentConfigProps
) => ResolveEnvironmentConfigReturn;

/**
 * Resolve environment-specific configuration for the Environment API.
 * This is a sophisticated version that follows the same patterns as resolveUserConfig
 * but adapted for Vite's Environment API requirements.
 */
export const resolveEnvironmentConfig: ResolveEnvironmentConfigFn =
  function _resolveEnvironmentConfig({
    condition,
    config,
    userOptions,
    autoDiscoveredFiles,
    ssr = undefined,
    forceResolve = false,
  }) {
    // Handle config changes and caching
    if (!forceResolve && originalConfig == null) {
      originalConfig = config;
    } else if (originalConfig != null && config !== originalConfig) {
      forceResolve = true;
    }

    // Determine SSR mode with fallbacks
    ssr =
      typeof ssr === "boolean"
        ? ssr
        : typeof config.build?.ssr === "boolean"
        ? config.build?.ssr
        : condition === REACT_CONDITION.server
        ? true
        : false;

    if (condition === REACT_CONDITION.server && !ssr) {
      const logger = config.customLogger ?? createLogger();
      logger.warn(
        "react-server build should be ssr, but it was manually set to false. This may not work as expected."
      );
    }

    // Determine environment-specific directory
    const envDir =
      condition === REACT_CONDITION.client && ssr
        ? userOptions.build.client
        : condition === REACT_CONDITION.client
        ? userOptions.build.static
        : userOptions.build.server;
    
    const envId = `${envDir}${ssr ? "-ssr" : ""}`;

    // Check cache first
    if (stashedEnvironmentConfig[envId] && !forceResolve) {
      return {
        type: "success",
        environmentConfig: stashedEnvironmentConfig[envId]!,
      };
    }

    try {
      // Get environment variables (env vars take precedence over config)
      const vitePrefix = config.envPrefix ?? DEFAULT_CONFIG.ENV_PREFIX;
      const primaryPrefix =
        typeof vitePrefix === "string" ? vitePrefix : vitePrefix[0];
      
      // The winner is written back into userOptions so the workers and the
      // edge bake agree.
      const resolvedModuleBaseURL = effectiveModuleBaseURL(
        userOptions,
        config.base,
        primaryPrefix
      );
      userOptions.moduleBaseURL = resolvedModuleBaseURL;

      const envPublicOrigin = getEnvValue("PUBLIC_ORIGIN", primaryPrefix);
      const effectivePublicOrigin =
        envPublicOrigin != null ? envPublicOrigin : userOptions.publicOrigin;

      // Set process.env values to ensure they're available for server-side code
      if (!getEnvValue("BASE_URL", primaryPrefix)) {
        setEnvValue("BASE_URL", resolvedModuleBaseURL, primaryPrefix);
      }
      if (!getEnvValue("PUBLIC_ORIGIN", primaryPrefix)) {
        setEnvValue("PUBLIC_ORIGIN", effectivePublicOrigin, primaryPrefix);
      }

      // Determine inputs based on condition and SSR with better normalization
      let inputs: Record<string, string>;
      if (condition === REACT_CONDITION.client) {
        if (ssr) {
          // For SSR builds, exclude HTML files and use only client inputs
          inputs = Object.fromEntries(
            Object.entries(autoDiscoveredFiles.clientInputs).filter(
              ([, value]) => !value.endsWith(".html") && !value.endsWith(".htm")
            )
          );
        } else {
          // For static builds, use static inputs (which can include HTML)
          inputs = autoDiscoveredFiles.staticInputs;
        }
      } else {
        // For server builds, use server inputs (no HTML files)
        inputs = autoDiscoveredFiles.serverInputs;
      }

      // Normalize inputs for this environment (following resolveUserConfig
      // pattern). Anchored to the root: Rollup (Vite 6/7) resolves relative
      // entries against the process cwd, Rolldown (Vite 8) against root.
      const inputRoot = resolve(config.root ?? userOptions.projectRoot);
      const normalizedInputs = Object.fromEntries(
        Object.entries(inputs).map(([key, value]) => [
          key,
          isAbsolute(value)
            ? value
            : resolve(inputRoot, value.replace(/^\/+/, "")),
        ])
      );

      // Handle user-defined output options (following resolveUserConfig pattern)
      const userDefinedOutput = config.build?.rollupOptions?.output;
      const hasOtherOutput =
        Array.isArray(userDefinedOutput) && userDefinedOutput.length > 1;
      const hasValidOutput = userDefinedOutput && !hasOtherOutput;
      const hasObjectOutput =
        userDefinedOutput &&
        !hasOtherOutput &&
        typeof userDefinedOutput === "object" &&
        userDefinedOutput !== null;

      const userDefinedAssetFileNames = hasObjectOutput
        ? "assetFileNames" in userDefinedOutput
          ? userDefinedOutput.assetFileNames
          : undefined
        : // find the other asset file names
        hasOtherOutput
        ? (userDefinedOutput.find((o) => o?.assetFileNames) as OutputOptions)
            ?.assetFileNames
        : undefined;

      const userDefinedChunkFileNames = hasValidOutput
        ? "chunkFileNames" in userDefinedOutput
          ? userDefinedOutput.chunkFileNames
          : undefined
        : undefined;
      const userDefinedEntryFileNames = hasValidOutput
        ? "entryFileNames" in userDefinedOutput
          ? userDefinedOutput.entryFileNames
          : undefined
        : undefined;

      // Rollup's preserveModulesRoot works in reverse of what you'd expect:
      // - When user wants preservation (true): pass undefined to Rollup (don't strip anything)
      // - When user wants stripping (false): pass moduleBase to Rollup (strip this path)
      const preserveModulesRootString =
        userOptions.build.preserveModulesRoot === false
          ? userOptions.moduleBase // Strip src/ from output paths
          : undefined; // Keep src/ in output paths
      

      // Basic rollup options - the file naming will be handled by resolveUserConfig mapping
      const rollupOptions = {
        input: normalizedInputs,
        output: {
          format: "esm" as const,
          exports: "named" as const,
          preserveModules: true, // Required for preserveModulesRoot to work
          preserveModulesRoot: preserveModulesRootString,
          // Note: entryFileNames, chunkFileNames, assetFileNames will be overridden by createEnvironmentPlugin mapping
          entryFileNames: userDefinedEntryFileNames,
          chunkFileNames: userDefinedChunkFileNames,
          assetFileNames: userDefinedAssetFileNames,
        },
      };

      if (condition === REACT_CONDITION.client) {
        // Client environment configuration
        const clientEnvironmentConfig: BuildEnvironmentOptions = {
          outDir: join(userOptions.build.outDir, envDir),
          assetsDir: userOptions.build.assetsDir,
          emptyOutDir: config.build?.emptyOutDir ?? true,
          copyPublicDir:
            typeof config.build?.copyPublicDir === "boolean"
              ? config.build?.copyPublicDir
              : !ssr,
          target: config.build?.target ?? "esnext",
          minify: config.build?.minify ?? true,
          manifest: config.build?.manifest ?? `.vite/manifest.json`,
          ssrManifest: config.build?.ssrManifest ?? false,
          ssrEmitAssets: config.build?.ssrEmitAssets ?? true,
          cssCodeSplit:
            typeof config.build?.cssCodeSplit === "boolean"
              ? config.build?.cssCodeSplit
              : true,
          modulePreload: config.build?.modulePreload ?? false,
          rollupOptions,
        };

        stashedEnvironmentConfig[envId] = clientEnvironmentConfig;
        return {
          type: "success",
          environmentConfig: clientEnvironmentConfig,
        };
      } else {
        // Server environment configuration
        const serverBuildEnvironmentOptions: BuildEnvironmentOptions = {
          outDir: join(userOptions.build.outDir, envDir),
          assetsDir: userOptions.build.assetsDir,
          emptyOutDir: config.build?.emptyOutDir ?? true,
          copyPublicDir:
            typeof config.build?.copyPublicDir === "boolean"
              ? config.build?.copyPublicDir
              : false,
          target: config.build?.target ?? "esnext", // Use esnext for pure ESM - no helpers needed
          minify: config.build?.minify ?? true,
          manifest: config.build?.manifest ?? `.vite/manifest.json`,
          ssrManifest: config.build?.ssrManifest ?? false,
          ssrEmitAssets:
            typeof config.build?.ssrEmitAssets === "boolean"
              ? config.build?.ssrEmitAssets
              : true,
          cssCodeSplit:
            typeof config.build?.cssCodeSplit === "boolean"
              ? config.build?.cssCodeSplit
              : true,
          modulePreload: config.build?.modulePreload ?? false,
          rollupOptions: {
            ...config.build?.rollupOptions,
            input: normalizedInputs,
            output: {
              format: "esm" as const,
              exports: "named" as const,
              preserveModules: true, // Required for preserveModulesRoot to work
              preserveModulesRoot: preserveModulesRootString,
              // Note: entryFileNames, chunkFileNames, assetFileNames will be overridden by createEnvironmentPlugin mapping
              entryFileNames: userDefinedEntryFileNames,
              chunkFileNames: userDefinedChunkFileNames,
              assetFileNames: userDefinedAssetFileNames,
            },
            preserveEntrySignatures:
              config.build?.rollupOptions?.preserveEntrySignatures ?? "strict",
            external: config.build?.rollupOptions?.external ?? [
              "react",
              "react/jsx-runtime",
              "react/jsx-dev-runtime",
              "react-dom",
              "react-server-dom-esm/server.node",
            ],
            context: "module",
            plugins: [
              ...(Array.isArray(config.build?.rollupOptions?.plugins)
                ? config.build.rollupOptions.plugins
                : config.build?.rollupOptions?.plugins
                ? [config.build.rollupOptions.plugins]
                : []),
              {
                name: "react-server-conditions",
                buildStart() {
                  // Ensure react-server condition is available during server builds
                  if (condition === REACT_CONDITION.server) {
                   // process.env.NODE_OPTIONS = (process.env.NODE_OPTIONS || "") + " --conditions react-server";
                  }
                },
              },
            ],
          },
        };

        stashedEnvironmentConfig[envId] = serverBuildEnvironmentOptions;
        return {
          type: "success",
          environmentConfig: serverBuildEnvironmentOptions,
        };
      }
    } catch (error) {
      return {
        type: "error",
        error,
      };
    }
  };
