import type { ConfigEnv, UserConfig, BuildEnvironmentOptions } from "vite";
import type { ResolvedUserOptions, AutoDiscoveredFiles } from "../types.js";
import { join } from "node:path";

/**
 * KEY DIFFERENCES FROM resolveUserConfig:
 * 
 * 1. Uses BuildEnvironmentOptions type instead of UserConfig
 * 2. Returns environment-specific configuration for Vite's Environment API
 * 3. Must set preserveModules: true for preserveModulesRoot to work
 * 4. Simplified input normalization (no moduleBase stripping in inputs)
 * 5. Environment-specific output directories and settings
 */

export type ResolveEnvironmentConfigProps = {
  condition: "react-client" | "react-server";
  config: UserConfig;
  configEnv: ConfigEnv;
  userOptions: ResolvedUserOptions;
  autoDiscoveredFiles: AutoDiscoveredFiles;
  ssr?: boolean;
};

export type ResolveEnvironmentConfigReturn =
  | { type: "success"; environmentConfig: BuildEnvironmentOptions }
  | { type: "error"; error: unknown };

/**
 * Resolve environment-specific configuration for the Environment API.
 * This is a simplified version of resolveUserConfig that only includes
 * features that work correctly with Vite's Environment API.
 */
export function resolveEnvironmentConfig({
  condition,
  config,
  configEnv,
  userOptions,
  autoDiscoveredFiles,
  ssr = undefined,
}: ResolveEnvironmentConfigProps): ResolveEnvironmentConfigReturn {
  try {
    const stashedReturns: Record<string, string> = {};
    
    const handleSsrEntryName = (
      info: any,
      input: string | null,
      fallback: (info: any, ssr: boolean) => string,
      ssr: boolean
    ) => {
      if (!ssr || !input) {
        if (typeof fallback === "function") {
          return fallback(info, false);
        }
        return userOptions.normalizer(info.name)[0];
      }
      const normalized = userOptions.normalizer(input);
      let value = normalized[1];
      if (value.startsWith(userOptions.moduleBasePath)) {
        value = value.slice(userOptions.moduleBasePath.length);
      }
      
      // For now, just use the fallback since static manifest loading is complex
      // The static manifest will be handled separately in the build process
      return fallback(info, true);
    };

    // Determine SSR setting
    ssr =
      typeof ssr === "boolean"
        ? ssr
        : typeof config.build?.ssr === "boolean"
        ? config.build?.ssr as boolean
        : condition === "react-server"
        ? true
        : typeof configEnv.isSsrBuild === "boolean"
        ? configEnv.isSsrBuild as boolean
        : false;

    if(typeof ssr !== "boolean") {
      return {
        type: "error",
        error: new Error("SSR is not a boolean"),
      };
    }

    // Determine output directory
    const envDir =
      condition === "react-client" && ssr
        ? userOptions.build.client
        : condition === "react-client"
        ? userOptions.build.static
        : userOptions.build.server;

    // Build inputs based on condition and SSR
    let inputs: Record<string, string>;
    if (condition === "react-client") {
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

    // DIFFERENCE: Simpler input normalization than resolveUserConfig
    // No moduleBase stripping here - handled by preserveModulesRoot in output
    const normalizedInputs = Object.fromEntries(
      Object.entries(inputs).map(([key, value]) => [
        key,
        value.slice(Number(value.startsWith("/"))),
      ])
    );

    if (condition === "react-client") {
      // Client environment configuration
      const clientEnvironmentConfig: BuildEnvironmentOptions = {
        outDir: join(userOptions.build.outDir, envDir),
        assetsDir: userOptions.build.assetsDir,
        emptyOutDir: config.build?.emptyOutDir ?? true,
        copyPublicDir:
          typeof config.build?.copyPublicDir === "boolean"
            ? config.build?.copyPublicDir
            : !ssr,
        target: config.build?.target ?? ["esnext"],
        minify: config.build?.minify,
        manifest: config.build?.manifest ?? `.vite/manifest.json`,
        ssrManifest: config.build?.ssrManifest ?? `.vite/ssr-manifest.json`,
        ssrEmitAssets: config.build?.ssrEmitAssets ?? true,
        cssCodeSplit:
          typeof config.build?.cssCodeSplit === "boolean"
            ? config.build?.cssCodeSplit
            : true,
        rollupOptions: {
          input: normalizedInputs,
          preserveEntrySignatures: "exports-only",
          external: ["fsevents"],
          output: {
            entryFileNames: ((info) => {
              const input =
                info.facadeModuleId ??
                info.name + userOptions.build.moduleExtension;
              const inputId = input + (ssr ? "-ssr" : "");
              
              if (!stashedReturns[inputId]) {
                const r = handleSsrEntryName(
                  info,
                  input,
                  userOptions.build.entryFile,
                  ssr as boolean
                );

                stashedReturns[inputId] = r ?? info.name;
              }
              // in the case of empty basePath, it will not be sliced from the path, so, we need to slice it here
              // at the last possible moment as to not confuse the rest of the logic around the basePath
              return stashedReturns[inputId].slice(
                Number(stashedReturns[inputId].startsWith("/"))
              );
            }),
            chunkFileNames: ((info) => {
              const input =
                info.facadeModuleId ??
                info.name + userOptions.autoDiscover.modulePattern.source;
              const inputId = input + (ssr ? "-ssr" : "");

              if (!stashedReturns[inputId]) {
                const r = handleSsrEntryName(
                  info,
                  input,
                  userOptions.build.chunkFile,
                  ssr as boolean
                );

                stashedReturns[inputId] = r ?? info.name;
              }
              // in the case of empty basePath, it will not be sliced from the path, so, we need to slice it here
              // at the last possible moment as to not confuse the rest of the logic around the basePath
              return stashedReturns[inputId].slice(
                Number(stashedReturns[inputId].startsWith("/"))
              );
            }),
            assetFileNames: join(userOptions.build.assetsDir, "[name].[ext]"),
            preserveModulesRoot:
              userOptions.build.preserveModulesRoot === false
                ? join(userOptions.build.outDir, envDir, userOptions.moduleBase)
                : undefined,
          },
        },
      };

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
        target: config.build?.target ?? "node18",
        minify: config.build?.minify,
        manifest: config.build?.manifest ?? `.vite/manifest.json`,
        ssrManifest: config.build?.ssrManifest ?? `.vite/ssr-manifest.json`,
        ssrEmitAssets: config.build?.ssrEmitAssets ?? true,
        cssCodeSplit:
          typeof config.build?.cssCodeSplit === "boolean"
            ? config.build?.cssCodeSplit
            : true,
        rollupOptions: {
          input: normalizedInputs,
          preserveEntrySignatures: "strict",
          external: [
            "react",
            "react/jsx-runtime",
            "react/jsx-dev-runtime",
            "react-dom",
            "react-server-dom-esm/server.node",
          ],
          output: {
            assetFileNames: join(userOptions.build.assetsDir, "[name].[ext]"),
            entryFileNames: ((info) => {
              const input =
                info.facadeModuleId ??
                info.name + userOptions.build.moduleExtension;
              const inputId = input + (ssr ? "-ssr" : "");
              
              if (!stashedReturns[inputId]) {
                const r = handleSsrEntryName(
                  info,
                  input,
                  userOptions.build.entryFile,
                  ssr as boolean
                );

                stashedReturns[inputId] = r ?? info.name;
              }
              // in the case of empty basePath, it will not be sliced from the path, so, we need to slice it here
              // at the last possible moment as to not confuse the rest of the logic around the basePath
              return stashedReturns[inputId].slice(
                Number(stashedReturns[inputId].startsWith("/"))
              );
            }),
            chunkFileNames: ((info) => {
              const input =
                info.facadeModuleId ??
                info.name + userOptions.autoDiscover.modulePattern.source;
              const inputId = input + (ssr ? "-ssr" : "");

              if (!stashedReturns[inputId]) {
                const r = handleSsrEntryName(
                  info,
                  input,
                  userOptions.build.chunkFile,
                  ssr as boolean
                );

                stashedReturns[inputId] = r ?? info.name;
              }
              // in the case of empty basePath, it will not be sliced from the path, so, we need to slice it here
              // at the last possible moment as to not confuse the rest of the logic around the basePath
              return stashedReturns[inputId].slice(
                Number(stashedReturns[inputId].startsWith("/"))
              );
            }),
            preserveModulesRoot:
              userOptions.build.preserveModulesRoot === false
                ? userOptions.moduleBase
                : undefined,
          },
        },
      };

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
}
