import type { ConfigEnv, UserConfig } from "vite";
import type {
  ResolvedUserConfig,
  ResolvedUserOptions,
  AutoDiscoveredFiles,
} from "../types.js";
import { join } from "node:path";
import type { OutputOptions, PreRenderedAsset, PreRenderedChunk } from "rollup";
import { DEFAULT_CONFIG } from "./defaults.js";

let stashedUserConfig: Record<string, ResolvedUserConfig | null> = {};

export type ResolveUserConfigProps = {
  condition: "react-client" | "react-server";
  config: UserConfig;
  configEnv: ConfigEnv;
  userOptions: ResolvedUserOptions;
  autoDiscoveredFiles: Pick<AutoDiscoveredFiles, "inputs" | "staticManifest">;
};

export type ResolveUserConfigReturn =
  | { type: "success"; userConfig: ResolvedUserConfig }
  | { type: "error"; error: Error };

export function resolveUserConfig({
  condition,
  config,
  configEnv,
  userOptions,
  autoDiscoveredFiles,
}: ResolveUserConfigProps): ResolveUserConfigReturn {
  const ssr =
    typeof config.build?.ssr === "boolean"
      ? config.build?.ssr
      : Boolean(configEnv.isSsrBuild) ||
        condition === "react-server" ||
        (process.env["VITE_SSR"] !== undefined && !!process.env["VITE_SSR"]);
  const envDir =
    condition === "react-client" && ssr
      ? userOptions.build.client
      : condition === "react-client"
      ? userOptions.build.static
      : userOptions.build.server;
  const envId = `${envDir}${ssr ? "-ssr" : ""}`;

  if (stashedUserConfig[envId]) {
    return {
      type: "success",
      userConfig: stashedUserConfig[envId],
    };
  }

  // Get existing inputs
  const root = config.root ?? userOptions.projectRoot ?? process.cwd();

  const handleSsrName = <T extends PreRenderedChunk | PreRenderedAsset>(
    info: T,
    input: string | null,
    fallback: (info: T, ssr: boolean) => string,
    ssr: boolean
  ) => {
    if (!ssr || !input) {
      return fallback(info, false);
    }
    const [, value] = userOptions.normalizer(input);
    const entry = autoDiscoveredFiles.staticManifest[value];
    if (
      entry?.name &&
      info.type === "asset" &&
      userOptions.autoDiscover.cssPattern(value)
    ) {
      const withoutExt = entry.name?.split(".")[0];
      const found = entry.css?.find((css) =>
        css.startsWith(withoutExt as string)
      );
      if (found) {
        return found;
      } else {
        return entry.file;
      }
    } else if (entry) {
      return entry.file;
    }
    return fallback(info, true);
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
    ? (userDefinedOutput.find((o) => o.assetFileNames) as OutputOptions)
        .assetFileNames
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

  let stashedReturns: Record<string, string> = {};
  const pluginOutput = {
    preserveModulesRoot: userOptions.build.preserveModulesRoot
      ? userOptions.moduleBase
      : undefined,
    entryFileNames:
      userDefinedEntryFileNames ??
      ((info) => {
        const input = info.facadeModuleId;
        return handleSsrName(info, input, userOptions.build.entryFile, ssr);
      }),
    assetFileNames: process.env["VITEST"]
      ? undefined
      : userDefinedAssetFileNames ??
        ((i) => {
          const input = i.originalFileNames[0];
          if (!stashedReturns[input]) {
            const r = handleSsrName(i, input, userOptions.build.assetFile, ssr);
            stashedReturns[input] = r;
          }
          return stashedReturns[input];
        }),
    chunkFileNames:
      userDefinedChunkFileNames ??
      ((i) => {
        const input = i.facadeModuleId;
        return handleSsrName(i, input, userOptions.build.chunkFile, ssr);
      }),
    format: "esm",
    exports: "named",
  } satisfies OutputOptions;

  let newOutput = Array.isArray(config.build?.rollupOptions?.output)
    ? [...config.build?.rollupOptions?.output, pluginOutput]
    : typeof config.build?.rollupOptions?.output === "object" &&
      config.build?.rollupOptions?.output !== null
    ? [config.build?.rollupOptions?.output, pluginOutput]
    : pluginOutput;
  const vitePrefix = config.envPrefix ?? DEFAULT_CONFIG.ENV_PREFIX;
  const mode = config.mode ?? process.env["VITE_MODE"];
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
    userOptions.publicOrigin ?? process.env["VITE_PUBLIC_ORIGIN"];
  let PROD = mode === "production";
  let DEV = mode === "development";
  if (configEnv.command === "serve" && !configEnv.isPreview) {
    publicOrigin = `http${config.server?.https ? "s" : ""}://${
      typeof config.server?.host === "string"
        ? config.server?.host
        : "localhost"
    }:${typeof config.server?.port === "number" ? config.server?.port : 5173}`;
  }
  const define = {
    ...config.define,
    [`import.meta.env.PUBLIC_ORIGIN`]: `"${publicOrigin}"`,
    [`process.env.${vitePrefix}SSR`]: `${ssr}`,
    [`process.env.${vitePrefix}DEV`]: `${DEV}`,
    [`process.env.${vitePrefix}PROD`]: `${PROD}`,
    [`process.env.${vitePrefix}MODE`]: `"${mode}"`,
    [`process.env.${vitePrefix}BASE_URL`]: `"${userOptions.moduleBaseURL}"`,
    [`process.env.${vitePrefix}PUBLIC_ORIGIN`]: `"${publicOrigin}"`,
  };

  if (condition === "react-client") {
    // client plugin build options (client plugin still outputs server files)
    const clientConfig = {
      ...config,
      root: root,
      mode: mode,
      base: userOptions.moduleBaseURL,
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
      // client build options
      build: {
        ...config.build,
        emptyOutDir: config.build?.emptyOutDir ?? true,
        outDir: config.build?.outDir ?? join(userOptions.build.outDir, envDir),
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
          input: autoDiscoveredFiles.inputs,
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
        emptyOutDir: config.build?.emptyOutDir ?? true,
        outDir: config.build?.outDir ?? join(userOptions.build.outDir, envDir),
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
}
