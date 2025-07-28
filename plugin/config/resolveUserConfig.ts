import type { ConfigEnv, UserConfig } from "vite";
import type {
  ResolvedUserConfig,
  ResolvedUserOptions,
  AutoDiscoveredFiles,
} from "../types.js";
import { join } from "node:path";
import type { OutputOptions, PreRenderedAsset, PreRenderedChunk } from "rollup";
import { DEFAULT_CONFIG } from "./defaults.js";
import { getNodeEnv } from "./getNodeEnv.js";

const stashedUserConfig: Record<string, ResolvedUserConfig | null> = {};
let originalConfig: UserConfig | null = null;
export type ResolveUserConfigProps = {
  condition: "react-client" | "react-server";
  config: UserConfig;
  configEnv: ConfigEnv;
  userOptions: ResolvedUserOptions;
  autoDiscoveredFiles: Pick<AutoDiscoveredFiles, "inputs" | "staticManifest">;
  forceResolve?: boolean;
};

export type ResolveUserConfigReturn =
  | { type: "success"; userConfig: ResolvedUserConfig }
  | { type: "error"; error: Error };

export type ResolveUserConfigFn = (
  props: ResolveUserConfigProps
) => ResolveUserConfigReturn;

export const resolveUserConfig: ResolveUserConfigFn =
  function _resolveUserConfig({
    condition,
    config,
    configEnv,
    userOptions,
    autoDiscoveredFiles,
    forceResolve = false,
  }) {
    if(!forceResolve && originalConfig == null) {
      originalConfig = config;
    } else if(originalConfig != null && config !== originalConfig) {
      if(userOptions.verbose) {
        console.log("options changed, forcing re-resolve");
      }
      forceResolve = true;
    }
    const ssr =
      typeof config.build?.ssr === "boolean"
        ? config.build?.ssr
        : Boolean(configEnv.isSsrBuild) ||
          condition === "react-server" ||
          (typeof process.env["VITE_SSR"] === "string"
            ? process.env["VITE_SSR"] === "true" ||
              process.env["VITE_SSR"] === "1"
            : Boolean(process.env["VITE_SSR"]));
    const envDir =
      condition === "react-client" && ssr
        ? userOptions.build.client
        : condition === "react-client"
        ? userOptions.build.static
        : userOptions.build.server;
    const envId = `${envDir}${ssr ? "-ssr" : ""}`;

    if (stashedUserConfig[envId] && !forceResolve) {
      return {
        type: "success",
        userConfig: stashedUserConfig[envId],
      };
    }

    // Get existing inputs
    const root = config.root ?? userOptions.projectRoot ?? process.cwd();

    const handleSsrEntryName = (
      info: PreRenderedChunk,
      input: string | null,
      fallback: (info: PreRenderedChunk, ssr: boolean) => string,
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
      const entry = autoDiscoveredFiles.staticManifest[value];
      if (entry) {
        return entry.file;
      }
      return fallback(info, true);
    };

    const handleSsrAssetName = (
      info: PreRenderedAsset,
      input: string | null,
      fallback: (info: PreRenderedAsset, ssr: boolean) => string,
      ssr: boolean
    ) => {
      if (info.source === "") {
        return "";
      }
      
      // Check if this is a CSS file
      const isCssFile = input?.endsWith('.css') || 
        info.names?.some(name => name.endsWith('.css'));
      
      if (!ssr || !input || isCssFile) {
        if (typeof fallback === "function") {
          return fallback(info, ssr);
        }
        return userOptions.normalizer(info.names[0])[0];
      }
      
      
      // First check if we have a static manifest entry for consistent module ID resolution
      const normalized = userOptions.normalizer(input);
      const id = normalized[0];
      let value = normalized[1];
      if (value.startsWith(userOptions.moduleBasePath)) {
        value = value.slice(userOptions.moduleBasePath.length);
      }
      
      const entry = autoDiscoveredFiles.staticManifest[value];
      if (entry) {
        // For CSS files, look for a specific CSS file that matches our normalized ID
        if (entry?.name && userOptions.autoDiscover.cssPattern.test(value)) {
          const found = entry.css?.find((css) => css.startsWith(id as string));
          if (found) {
            return join(userOptions.build.assetsDir, found);
          } else {
            return join(userOptions.build.assetsDir, entry.file);
          }
        } else {
          // For other assets, use the entry file
          return entry.file;
        }
      }
      
      // Fall back to the user's assetFile function for consistent behavior
      return fallback(info, ssr);
    };
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

    const stashedReturns: Record<string, string> = {};
    const pluginOutput = {
      preserveModulesRoot: userOptions.build.preserveModulesRoot
        ? userOptions.moduleBase
        : undefined,
      entryFileNames:
        userDefinedEntryFileNames ??
        ((info) => {
          const input =
            info.facadeModuleId ??
            info.name + userOptions.build.moduleExtension;
          const inputId = input + (ssr ? "-ssr" : "");
          if (!stashedReturns[inputId]) {
            const r = handleSsrEntryName(
              info,
              input,
              userOptions.build.entryFile,
              ssr
            );

            stashedReturns[inputId] = r ?? info.name;
          }
          // in the case of empty basePath, it will not be sliced from the path, so, we need to slice it here
          // at the last possible moment as to not confuse the rest of the logic around the basePath
          return stashedReturns[inputId].slice(
            Number(stashedReturns[inputId].startsWith("/"))
          );
        }),
      assetFileNames: process.env["VITEST"]
        ? undefined
        : userDefinedAssetFileNames ??
          ((info) => {
            const input = info.originalFileNames[0];
            const inputId = input + (ssr ? "-ssr" : "");

            if (!stashedReturns[inputId]) {
              const r = handleSsrAssetName(
                info,
                input,
                userOptions.build.assetFile,
                ssr
              );
              

              stashedReturns[inputId] = r ?? join(userOptions.build.assetsDir, userOptions.normalizer(input)[0]);
            }
            // in the case of empty basePath, it will not be sliced from the path, so, we need to slice it here
            // at the last possible moment as to not confuse the rest of the logic around the basePath
            return stashedReturns[inputId].slice(
              Number(stashedReturns[inputId].startsWith("/"))
            );
          }),
      chunkFileNames:
        userDefinedChunkFileNames ??
        ((info) => {
          const input =
            info.facadeModuleId ??
            info.name + userOptions.autoDiscover.modulePattern.source;
          const inputId = input + (ssr ? "-ssr" : "");

          if (!stashedReturns[inputId]) {
            const r = handleSsrEntryName(
              info,
              input,
              userOptions.build.chunkFile,
              ssr
            );


            stashedReturns[inputId] = r ?? info.name;
          }
          // in the case of empty basePath, it will not be sliced from the path, so, we need to slice it here
          // at the last possible moment as to not confuse the rest of the logic around the basePath
          return stashedReturns[inputId].slice(
            Number(stashedReturns[inputId].startsWith("/"))
          );
        }),
      format: "esm",
      exports: "named",
    } satisfies OutputOptions;

    const newOutput = Array.isArray(config.build?.rollupOptions?.output)
      ? [...(config.build?.rollupOptions?.output || null), pluginOutput]
      : typeof config.build?.rollupOptions?.output === "object" &&
        config.build?.rollupOptions?.output !== null
      ? [config.build?.rollupOptions?.output, pluginOutput]
      : pluginOutput;
    const vitePrefix = config.envPrefix ?? DEFAULT_CONFIG.ENV_PREFIX;
    
    // Retroactively update userOptions with environment variables (env vars take precedence over config)
    const envBaseUrl = process.env[`${vitePrefix}BASE_URL`];
    if (envBaseUrl != null && envBaseUrl !== "") {
      userOptions.moduleBaseURL = envBaseUrl;
    }
    const envPublicOrigin = process.env[`${vitePrefix}PUBLIC_ORIGIN`];
    if (envPublicOrigin != null) {
      userOptions.publicOrigin = envPublicOrigin;
    }
    
    const nodeEnv = getNodeEnv();
    let mode =
      config.mode ??
      process.env[`${vitePrefix}MODE`] ??
      process.env["NODE_ENV"] ??
      nodeEnv;

    if (mode !== nodeEnv) {
      if (typeof config.mode === "string" && nodeEnv !== "production") {
        throw new Error(`Mode ${mode} must be equal to NODE_ENV ${nodeEnv}.`);
      }
      mode = nodeEnv;
    }
    const minify = config.build?.minify;

    const srrConfig = {
      ...config.ssr,
      target: config.ssr?.target ?? "node",
      optimizeDeps: {
        ...config.ssr?.optimizeDeps,
        include: config.ssr?.optimizeDeps?.include ?? [
          "react",
          "react-dom",
          "react-server-dom-esm/client",
        ],
      },
      resolve: {
        ...config.ssr?.resolve,
        externalConditions: config.ssr?.resolve?.externalConditions ?? [
          "react-server",
        ],
      },
    };
    let publicOrigin =
      userOptions.publicOrigin ??
      process.env[`${vitePrefix}PUBLIC_ORIGIN`] ??
      "";
    const PROD = mode === "production";
    const DEV = mode === "development";
    const port =
      typeof config.server?.port === "number" ? config.server?.port : 5173;
    const strictPort = config.server?.strictPort ?? true;
    const host =
      typeof config.server?.host === "string"
        ? config.server?.host
        : "localhost";
    const base = config.base ?? userOptions.moduleBaseURL ?? DEFAULT_CONFIG.MODULE_BASE_URL;
    if (configEnv.command === "serve" && !configEnv.isPreview) {
      if (strictPort) {
        publicOrigin = `http${
          config.server?.https ? "s" : ""
        }://${host}:${port}`;
      } else {
        publicOrigin = "";
      }
    }
    const ssrDefine = ssr
      ? {
          [`process.env.${vitePrefix}SSR`]: `${ssr}`,
          [`process.env.${vitePrefix}DEV`]: `${DEV}`,
          [`process.env.${vitePrefix}PROD`]: `${PROD}`,
          [`process.env.${vitePrefix}MODE`]: `"${mode}"`,
          [`process.env.${vitePrefix}BASE_URL`]: `"${base}"`,
          [`process.env.${vitePrefix}PUBLIC_ORIGIN`]: `"${publicOrigin}"`,
        }
      : {};
    const define = {
      ...config.define,
      [`import.meta.env.BASE_URL`]: `"${base}"`,
      [`import.meta.env.PUBLIC_ORIGIN`]: `"${publicOrigin}"`,
      ...ssrDefine,
    };

    // Set process.env values to ensure they're available in process.env for server-side code
    // These will never be cleaned up, because we are resolving the user config
    // and it's assumed the thread closes after this and we don't want
    // it to change after the config has been resolved
    process.env[`${vitePrefix}BASE_URL`] = base;
    process.env[`${vitePrefix}PUBLIC_ORIGIN`] = publicOrigin;

    if (condition === "react-client") {
      // client plugin build options (client plugin still outputs server files)
      const clientConfig = {
        ...config,
        root: root,
        mode: mode,
        base: base,
        envPrefix: vitePrefix,
        resolve: {
          ...config.resolve,
          external: config.resolve?.external ?? [
            "react",
            "react-dom",
            "react-server-dom-esm/client",
          ],
        },
        define: define,
        ssr: srrConfig,
        server: {
          ...config.server,
          // common default for stricter server operations
          // and ensures tests that use a server will fail early
          // also, we can't set the public origin without a port
          port: port,
          strictPort: strictPort,
          host: host,
        },
        // client build options
        build: {
          ...config.build,
          modulePreload: config.build?.modulePreload ?? false,
          emptyOutDir: config.build?.emptyOutDir ?? true,
          outDir:
            config.build?.outDir ?? join(userOptions.build.outDir, envDir),
          assetsDir: config.build?.assetsDir ?? userOptions.build.assetsDir,
          copyPublicDir:
            typeof config.build?.copyPublicDir === "boolean"
              ? config.build?.copyPublicDir
              : !ssr,
          // modern browsers
          target: config.build?.target ?? ["esnext"],
          minify: minify,
          rollupOptions: {
            ...config.build?.rollupOptions,
            input: Object.fromEntries(
              Object.entries(autoDiscoveredFiles.inputs).map(([key, value]) => [
                key,
                value.slice(Number(value.startsWith("/"))),
              ])
            ),
            output: newOutput,
            preserveEntrySignatures:
              config.build?.rollupOptions?.preserveEntrySignatures ??
              "exports-only",
          },
          ssr: ssr,
          manifest: config.build?.manifest ?? `.vite/manifest.json`,
          ssrManifest: config.build?.ssrManifest ?? `.vite/ssr-manifest.json`,
          ssrEmitAssets: config.build?.ssrEmitAssets ?? true,
          cssCodeSplit:
            typeof config.build?.cssCodeSplit === "boolean"
              ? config.build?.cssCodeSplit
              : true,
        },
      } satisfies ResolvedUserConfig;
      stashedUserConfig[envId] = clientConfig;
      return {
        type: "success",
        userConfig: clientConfig,
      };
    } else {
      const serverConfig = {
        ...config,
        root: root,
        mode: mode,
        base: userOptions.moduleBaseURL,
        envPrefix: vitePrefix,
        resolve: {
          ...config.resolve,
          externalConditions: config.resolve?.externalConditions ?? [
            "react-server",
          ],
        },
        define: define,
        ssr: srrConfig,
        // server build options
        build: {
          ...config.build,
          modulePreload: config.build?.modulePreload ?? false,
          emptyOutDir: config.build?.emptyOutDir ?? true,
          outDir:
            config.build?.outDir ?? join(userOptions.build.outDir, envDir),
          target: config.build?.target ?? "node18",
          minify: minify,
          ssr: ssr,
          manifest: config.build?.manifest ?? `.vite/manifest.json`,
          ssrManifest: config.build?.ssrManifest ?? `.vite/ssr-manifest.json`,
          ssrEmitAssets:
            typeof config.build?.ssrEmitAssets === "boolean"
              ? config.build?.ssrEmitAssets
              : true,
          copyPublicDir:
            typeof config.build?.copyPublicDir === "boolean"
              ? config.build?.copyPublicDir
              : !ssr,
          assetsDir: config.build?.assetsDir ?? userOptions.build.assetsDir,
          // Ensure CSS files are output to static directory
          cssCodeSplit:
            typeof config.build?.cssCodeSplit === "boolean"
              ? config.build?.cssCodeSplit
              : true,
          rollupOptions: {
            ...config.build?.rollupOptions,
            input: autoDiscoveredFiles.inputs,
            preserveEntrySignatures:
              config.build?.rollupOptions?.preserveEntrySignatures ?? "strict",
            output: newOutput,
          },
        },
      } satisfies ResolvedUserConfig;
      stashedUserConfig[envId] = serverConfig;
      return {
        type: "success",
        userConfig: serverConfig,
      };
    }
  };
