import type { ConfigEnv, UserConfig } from "vite";
import type {
  ResolvedUserConfig,
  ResolvedUserOptions,
  AutoDiscoveredFiles,
} from "../types.js";
import { join } from "node:path";
import type { OutputOptions } from "rollup";

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
      : Boolean(configEnv.isSsrBuild) || condition === "react-server";
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
  const staticEntries =
    ssr && autoDiscoveredFiles.staticManifest
      ? Object.entries(autoDiscoveredFiles.staticManifest)
      : [];
  const pluginOutput = {
    preserveModulesRoot: userOptions.build.preserveModulesRoot
      ? userOptions.moduleBase
      : undefined,
    entryFileNames: (info) => {
      if (ssr) {
        const entry = staticEntries.find(([, { file }]) =>
          file.startsWith(info.name)
        );
        if (entry) {
          return entry[1].file;
        }
      }
      return userOptions.build.entryFile(info, ssr);
    },
    assetFileNames: (i) => {
      return userOptions.build.assetFile(i, false);
    },
    chunkFileNames: (i) => {
      return userOptions.build.chunkFile(i, ssr);
    },
    format: "esm",
    exports: "named",
  } satisfies OutputOptions;

  let newOutput = Array.isArray(config.build?.rollupOptions?.output)
    ? [...config.build?.rollupOptions?.output, pluginOutput]
    : typeof config.build?.rollupOptions?.output === "object" &&
      config.build?.rollupOptions?.output !== null
    ? [config.build?.rollupOptions?.output, pluginOutput]
    : pluginOutput;
  const mode =
    process.env["NODE_ENV"] === "development"
      ? "development"
      : config.mode
      ? config.mode
      : configEnv.mode
      ? configEnv.mode
      : configEnv.command === "build"
      ? "production"
      : "development";
  const minify = config.build?.minify;
  if (condition === "react-client") {
    // client plugin build options (client plugin still outputs server files)
    stashedUserConfig[envId] = {
      ...config,
      root: root,
      mode: mode,
      base: userOptions.moduleBasePath,
      resolve: {
        ...config.resolve,
        external: config.resolve?.external ?? [
          "react",
          "react-dom",
          "react-server-dom-esm/client",
        ],
      },
      ssr: {
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
      },
      // client build options
      build: {
        ...config.build,
        emptyOutDir: config.build?.emptyOutDir ?? true,
        outDir: config.build?.outDir ?? join(userOptions.build.outDir, envDir),
        assetsDir: config.build?.assetsDir ?? userOptions.build.assetsDir,
        copyPublicDir: config.build?.copyPublicDir ?? true,
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
    };
  } else {
    stashedUserConfig[envId] = {
      ...config,
      root: root,
      mode: mode,
      base: userOptions.moduleBasePath,
      resolve: {
        ...config.resolve,
        externalConditions: config.resolve?.externalConditions ?? [
          "react-server",
        ],
      },
      define: {
        ...config.define,
        "process.env.VITE_SSR": `"1"`,
        "process.env.VITE_DEV": `"${mode === "development" ? "1" : "0"}"`,
        "process.env.VITE_PROD": `"${mode === "production" ? "1" : "0"}"`,
        "process.env.VITE_MODE": `"${mode}"`,
        "process.env.VITE_BASE_URL": `"${
          userOptions.moduleBasePath === "" ||
          userOptions.moduleBasePath === "/"
            ? "/"
            : !userOptions.moduleBasePath.endsWith("/")
            ? userOptions.moduleBasePath + "/"
            : userOptions.moduleBasePath
        }"`,
      },
      ssr: {
        ...config.ssr,
        target: config.ssr?.target ?? "node",

        resolve: {
          ...config.ssr?.resolve,
          externalConditions: config.ssr?.resolve?.externalConditions ?? [
            "react-server",
          ],
        },
      },
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
            : true,
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
    };
  }
  if (!stashedUserConfig[envId]) {
    return {
      type: "error",
      error: new Error("Failed to resolve config"),
    };
  }

  return {
    type: "success",
    userConfig: stashedUserConfig[envId],
  };
}
