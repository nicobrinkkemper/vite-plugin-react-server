import type { ConfigEnv, UserConfig } from "vite";
import type {
  ResolvedUserConfig,
  ResolvedUserOptions,
  AutoDiscoveredFiles,
} from "../types.js";
import { format, join } from "path";
import type { OutputOptions, PreRenderedAsset } from "rollup";

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
      : Boolean(configEnv.isSsrBuild);
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
  const staticEntries = Object.entries(autoDiscoveredFiles.staticManifest);
  const pluginOutput = {
    preserveModulesRoot: userOptions.build.preserveModulesRoot
      ? userOptions.moduleBase
      : undefined,
    entryFileNames: (info) => {
      if(ssr) {
        const entry = staticEntries.find(([key, {file}]) => file.startsWith(info.name));
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
    hoistTransitiveImports: false,
    generatedCode: {
      constBindings: true,
      objectShorthand: true,
    },
    interop: "auto",
    name: "React",
    extend: true,
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
  if (condition === "react-client") {
    // client plugin build options (client plugin still outputs server files)
    stashedUserConfig[envId] = {
      ...config,
      root: root,
      mode: mode,
      resolve: {
        external: ["react", "react-dom"],
      },
      ssr: {
        target: "node",
        resolve: {
          externalConditions: ["react-server"],
        },
      },
      // client build options
      build: {
        ...config.build,
        emptyOutDir: config.build?.emptyOutDir ?? true,
        outDir: join(userOptions.build.outDir, envDir),
        assetsDir: config.build?.assetsDir ?? userOptions.build.assetsDir,
        copyPublicDir: config.build?.copyPublicDir ?? true,
        // modern browsers
        target: ["esnext"],
        minify: false,
        rollupOptions: {
          ...config.build?.rollupOptions,
          input: autoDiscoveredFiles.inputs,
          output: newOutput,
          preserveEntrySignatures: "exports-only",
        },
        ssr: ssr,
        manifest: config.build?.manifest ?? `.vite/manifest.json`,
        ssrManifest: config.build?.ssrManifest ?? `.vite/ssr-manifest.json`,
        ssrEmitAssets: config.build?.ssrEmitAssets ?? true,
        cssCodeSplit: true,
      },
    };
  } else {
    stashedUserConfig[envId] = {
      ...config,
      root: root,
      mode: mode,
      resolve: {
        externalConditions: ["react-server"],
      },
      ssr: {
        target: "node",
        resolve: {
          externalConditions: ["react-server"],
        },
      },
      // server build options
      build: {
        ...config.build,
        emptyOutDir: config.build?.emptyOutDir ?? true,
        outDir: join(userOptions.build.outDir, envDir),
        target: config.build?.target ?? "node18",
        minify: config.build?.minify ?? true,
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
