import type { ConfigEnv, UserConfig } from "vite";
import type { CheckFilesExistReturn, ResolvedUserConfig, ResolvedUserOptions } from "../types.js";
import { DEFAULT_CONFIG } from "./defaults.js";

export type ResolveUserConfigProps = {
  condition: "react-client" | "react-server" | "";
  config: UserConfig;
  configEnv: ConfigEnv;
  userOptions: ResolvedUserOptions;
  files?: CheckFilesExistReturn;
};

export type ResolveUserConfigReturn = 
  | { type: "success"; userConfig: ResolvedUserConfig }
  | { type: "error"; error: Error };

export function resolveUserConfig({
  condition,
  config,
  configEnv,
  userOptions,
  files
}: ResolveUserConfigProps): ResolveUserConfigReturn {
  console.log("[resolveUserConfig] Input:", {
    condition,
    configEnv,
    root: config.root,
    build: config.build
  });

  try {
    // Get existing inputs
    const existingInput = config.build?.rollupOptions?.input || {};
    const currentInputs = typeof existingInput === 'string' ? { default: existingInput } : existingInput;

    // Add inputs based on condition
    const inputs = {
      ...currentInputs,
      ...(condition === 'react-server' && files ? {
        server: userOptions.serverEntry,
        'index.html': '/index.html',
        ...Object.fromEntries([
          ...files.pageMap.entries(),
          ...files.propsMap.entries()
        ].map(([key, path]) => [key, path]))
      } : {
        client: userOptions.clientEntry
      })
    };

    const userConfig = {
      ...config,
      root: config.root ?? userOptions.projectRoot ?? process.cwd(),
      mode: configEnv.command === 'build' ? 'production' : 'development',
      build: {
        ...config.build,
        outDir: condition === 'react-server' ? userOptions.build.server : userOptions.build.client,
        assetsDir: condition === 'react-server' ? "" : DEFAULT_CONFIG.CLIENT_ASSETS_DIR,
        ssr: condition === 'react-server',
        target: condition === 'react-server' ? 'node18' : 'es2020',
        minify: condition === 'react-server' ? false : true,
        manifest: true,
        ssrManifest: false,
        ssrEmitAssets: true,
        rollupOptions: {
          ...config.build?.rollupOptions,
          input: inputs,
          preserveEntrySignatures: 'strict',
          output: condition === 'react-server' ? {
            preserveModules: true,
            entryFileNames: '[name].js',
            assetFileNames: '[name].[ext]',
            chunkFileNames: '[name].[ext]',
            format: 'esm',
            exports: 'named',
            preserveModulesRoot: userOptions.moduleBase,
            hoistTransitiveImports: false,
            generatedCode: {
              constBindings: true,
              objectShorthand: true
            },
            interop: 'auto'
          } : undefined
        }
      }
    };

    console.log("[resolveUserConfig] Output:", {
      condition,
      root: userConfig.root,
      build: userConfig.build
    });

    return {
      type: "success",
      userConfig: userConfig as ResolvedUserConfig
    };
  } catch (error) {
    return {
      type: "error",
      error: error instanceof Error ? error : new Error("Failed to resolve config")
    };
  }
} 