import type { ConfigEnv, UserConfig } from "vite";
import type {
  CheckFilesExistReturn,
  ResolvedUserConfig,
  ResolvedUserOptions,
} from "../types.js";
import { createInputNormalizer } from "../helpers/inputNormalizer.js";
import { join } from "path";
// @ts-ignore
import { globSync } from "fs";
import type { OutputOptions } from "rollup";
import { pluginRoot } from "../root.js";

let stashedUserConfig: Record<string, ResolvedUserConfig | null> = {};

export type ResolveUserConfigProps = {
  isClient?: boolean;
  isStatic?: boolean;
  config: UserConfig;
  configEnv: ConfigEnv;
  userOptions: ResolvedUserOptions;
  files?: CheckFilesExistReturn;
};

export type ResolveUserConfigReturn =
  | { type: "success"; userConfig: ResolvedUserConfig }
  | { type: "error"; error: Error };

export function resolveUserConfig({
  isClient = false,
  isStatic = false,
  config,
  configEnv,
  userOptions,
  files,
}: ResolveUserConfigProps): ResolveUserConfigReturn {
  if(isStatic) {
    const serverConfig = stashedUserConfig[`${userOptions.build.server}-ssr`]
    if(!serverConfig) {
      return {
        type: "error",
        error: new Error("Static plugin should run after the server plugin"),
      }
    }
    return {
      type: "success",
      userConfig: serverConfig,
    }
  }
  const envDir = isStatic
    ? userOptions.build.static
    : isClient
    ? userOptions.build.client
    : userOptions.build.server;
  const ssr =
    typeof config.build?.ssr === "boolean"
      ? config.build?.ssr
      : configEnv.isSsrBuild || (!isClient && !isStatic);
  const envId = `${envDir}${ssr ? "-ssr" : ""}`;
  if (stashedUserConfig[envId]) {
    console.log(`[RSC] Using cached config for ${envId}`);
    return {
      type: "success",
      userConfig: stashedUserConfig[envId],
    };
  }
  // Get existing inputs
  const root = config.root ?? userOptions.projectRoot ?? process.cwd();

  const normalizer = createInputNormalizer({
    root,
    preserveModulesRoot: userOptions.build.preserveModulesRoot
      ? userOptions.moduleBase
      : undefined,
    removeExtension: true,
  });

  const serverEntry = userOptions.serverEntry
    ? Object.fromEntries([
        normalizer([userOptions.serverEntry, userOptions.serverEntry]),
      ])
    : null;
  const clientEntry = userOptions.clientEntry
    ? Object.fromEntries(
        [
          [userOptions.clientEntry, userOptions.clientEntry],
          ["index.html", "index.html"],
        ].map(normalizer)
      )
    : { "index.html": "index.html" };

  const autoDiscoveredClientFiles = (inputs: Record<string, string>) => {
    const allFiles = globSync(`**/*.client.*`, {
      cwd: join(root, userOptions.moduleBase),
    });

    for (const file of allFiles) {
      const [key, value] = normalizer(join(userOptions.moduleBase, file));
      if (!inputs[key]) {
        inputs[key] = value;
      } else {
        console.warn(`[RSC] Client file already exists: ${key}`);
      }
    }
    return inputs;
  };
  const autoDiscoveredServerFiles = (inputs: Record<string, string>) => {
    const allFiles = globSync(`${userOptions.moduleBase}/**/*.server.*`, {
      cwd: join(root, userOptions.moduleBase),
    });
    for (const file of allFiles) {
      const [key, value] = normalizer(join(userOptions.moduleBase, file));
      if (!inputs[key]) {
        inputs[key] = value;
      } else {
        console.warn(`[RSC] Server file already exists: ${key}`);
      }
    }
    return inputs;
  };
  const customWorkerFiles = (inputs: Record<string, string>) => {
    const customRscWorker =  !userOptions.rscWorkerPath.startsWith(pluginRoot)
    const customHtmlWorker =  !userOptions.htmlWorkerPath.startsWith(pluginRoot)
    if(customRscWorker && !inputs['rsc-worker']) {
      inputs['rsc-worker'] = userOptions.rscWorkerPath
    }
    if(customHtmlWorker && !inputs['html-worker']) {
      inputs['html-worker'] = userOptions.htmlWorkerPath
    }
    return inputs
  }
  const autoDiscoveredFiles = (inputs: Record<string, string>) => {
    if (!files) return inputs;

    // Add page files without extra prefix
    for (const [key, value] of files.pageMap) {
      if (!inputs[key]) {
        inputs[key] = value;
      } else {
        console.warn(`[RSC] Page file already exists: ${key}`);
      }
    }
    // Add props files without extra prefix
    for (const [key, value] of files.propsMap) {
      if (!inputs[key]) {
        inputs[key] = value;
      } else {
        console.warn(`[RSC] Props file already exists: ${key}`);
      }
    }
    return inputs;
  };

  // Add inputs based on condition
  let inputs = isClient
    ? autoDiscoveredClientFiles(clientEntry)
    : customWorkerFiles(autoDiscoveredServerFiles(autoDiscoveredFiles(serverEntry ?? {})));

  const pluginOutput = {
    preserveModules: !isClient,
    preserveModulesRoot: userOptions.build.preserveModulesRoot
      ? userOptions.moduleBase
      : undefined,
    entryFileNames: userOptions.build.entryFile,
    assetFileNames: userOptions.build.assetFile,
    chunkFileNames: userOptions.build.chunkFile,
    format: "esm",
    exports: "named",
    hoistTransitiveImports: false,
    generatedCode: {
      constBindings: true,
      objectShorthand: true,
    },
    interop: "auto",
  } satisfies OutputOptions;

  let newOutput = Array.isArray(config.build?.rollupOptions?.output)
    ? [...config.build?.rollupOptions?.output, pluginOutput]
    : typeof config.build?.rollupOptions?.output === "object" &&
      config.build?.rollupOptions?.output !== null
    ? [config.build?.rollupOptions?.output, pluginOutput]
    : pluginOutput;

  if (isClient) {
    // client plugin build options (client plugin still outputs server files)
    stashedUserConfig[envId] = {
      ...config,
      root: root,
      mode:
        configEnv.mode ?? configEnv.command === "build"
          ? "production"
          : "development",
      resolve: {
        external: ["react", "react-dom"],
        alias: {},
      },
      ssr: {
        target: "node",
        external: ["react", "react-dom", "react-server-dom-esm/client.browser"],
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
        minify: true,
        ssr: ssr,
        manifest: config.build?.manifest ?? `.vite/manifest.json`,
        ssrManifest: config.build?.ssrManifest ?? `.vite/ssr-manifest.json`,
        ssrEmitAssets: config.build?.ssrEmitAssets ?? true,
        rollupOptions: {
          ...config.build?.rollupOptions,
          input: inputs,
          output: newOutput,
          preserveEntrySignatures: "exports-only",
        },
      },
    };
  } else {
    // server build options
    if (configEnv.isSsrBuild === false) {
      configEnv.isSsrBuild = true;
    }
    stashedUserConfig[envId] = {
      ...config,
      root: root,
      mode:
        configEnv.mode ?? configEnv.command === "build"
          ? "production"
          : "development",
      resolve: {
        externalConditions: ["react-server"],
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
        ssrEmitAssets: config.build?.ssrEmitAssets ?? true,
        copyPublicDir: config.build?.copyPublicDir ?? isStatic,
        assetsDir: config.build?.assetsDir ?? userOptions.build.assetsDir,
        rollupOptions: {
          ...config.build?.rollupOptions,
          input: inputs,
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
