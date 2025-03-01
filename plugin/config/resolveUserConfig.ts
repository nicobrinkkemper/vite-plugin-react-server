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
export type ResolveUserConfigProps = {
  isClient?: boolean;
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
  config,
  configEnv,
  userOptions,
  files,
}: ResolveUserConfigProps): ResolveUserConfigReturn {
  try {
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
      : autoDiscoveredServerFiles(autoDiscoveredFiles(serverEntry ?? {}));

    const envDir = isClient
      ? userOptions.build.client
      : userOptions.build.server;

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
    
    const newOutput = Array.isArray(config.build?.rollupOptions?.output)
      ? [...config.build?.rollupOptions?.output, pluginOutput]
      : typeof config.build?.rollupOptions?.output === "object" &&
        config.build?.rollupOptions?.output !== null
      ? [config.build?.rollupOptions?.output, pluginOutput]
      : pluginOutput;

    if (isClient) {
      // client build options
      return {
        type: "success",
        userConfig: {
          ...config,
          root: root,
          mode: configEnv.mode ?? configEnv.command === "build" ? "production" : "development",
          resolve: {
            external: ["react", "react-dom"],
            alias: {},
          },
          ssr: {
            target: "node",
            external: [
              "react",
              "react-dom",
              "react-server-dom-esm/client.browser",
            ],
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
            // modern browsers
            target: ["esnext"],
            minify: true,
            ssr:
              typeof configEnv.isSsrBuild === "boolean"
                ? configEnv.isSsrBuild
                : true,
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
        },
      };
    }
    // server build options
    return {
      type: "success",
      userConfig: {
        ...config,
        root: root,
        mode: configEnv.mode ?? configEnv.command === "build" ? "production" : "development",
        resolve: {
          alias: {},
          externalConditions: ["react-server"],
        },
        // server build options
        build: {
          ...config.build,
          emptyOutDir: config.build?.emptyOutDir ?? true,
          outDir: join(userOptions.build.outDir, envDir),
          target: config.build?.target ?? "node18",
          minify: config.build?.minify ?? true,
          ssr: config.build?.ssr ?? configEnv.isSsrBuild ?? true,
          manifest: config.build?.manifest ?? `.vite/manifest.json`,
          ssrManifest: config.build?.ssrManifest ?? `.vite/ssr-manifest.json`,
          ssrEmitAssets: config.build?.ssrEmitAssets ?? true,
          assetsDir: config.build?.assetsDir ?? userOptions.build.assetsDir,
          rollupOptions: {
            ...config.build?.rollupOptions,
            input: inputs,
            preserveEntrySignatures: config.build?.rollupOptions?.preserveEntrySignatures ?? "strict",
            output: newOutput,
          },
        },
      },
    };
  } catch (error) {
    return {
      type: "error",
      error:
        error instanceof Error ? error : new Error("Failed to resolve config"),
    };
  }
}
