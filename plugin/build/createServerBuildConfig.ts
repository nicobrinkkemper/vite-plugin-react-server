import { join } from "node:path";
import type { ResolvedUserConfig, ResolvedUserOptions } from "../types.js";
import type { UserConfig } from "vite";

interface CreateServerBuildConfigProps {
  condition: string;
  userConfig: ResolvedUserConfig;
  userOptions: ResolvedUserOptions;
  mode: string;
  inputNormalizer: any;
}

export async function createServerBuildConfig({
  userConfig,
  userOptions,
  mode,
}: CreateServerBuildConfigProps): Promise<UserConfig> {
  const { build, appType, mode: configMode, ...restUserConfig } = userConfig;
  const { outDir, ssr, target, assetsDir, manifest, ssrManifest, ssrEmitAssets, rollupOptions, ...restBuildOptions } = build ?? {}; 
  const { input, output, ...restRollupOptions } = rollupOptions ?? {};
  const {
    format,
    preserveModules,
    hoistTransitiveImports,
    esModule,
    entryFileNames,
    chunkFileNames,
    assetFileNames,
    ...restOutputOptions
  } = output && !Array.isArray(output) ? output : {};

  const resolvedBuildConfig = {
    build: {
      ssr: ssr ?? true,
      target: target ?? 'es2020',
      outDir: outDir ?? userOptions.build.server,
      assetsDir: assetsDir ?? '',
      manifest: manifest ?? true,
      ssrManifest: ssrManifest ?? true,
      ssrEmitAssets: ssrEmitAssets ?? true,
      rollupOptions: {
        input: {
          'client': join(userOptions.projectRoot, userOptions.clientEntry)
        },
        output: {
          format: format ?? 'esm',
          preserveModules: preserveModules ?? true,
          hoistTransitiveImports: hoistTransitiveImports ?? false,
          esModule: esModule ?? true,
          entryFileNames: entryFileNames ?? '[name].js',
          chunkFileNames: chunkFileNames ?? '[name].js',
          assetFileNames: assetFileNames ?? '[name][extname]',
          ...restOutputOptions
        },
        ...restRollupOptions
      },
      ...restBuildOptions
    },
    appType: appType ?? 'mpa',
    mode: mode ?? 'production',
    ...restUserConfig
  };

  console.log('resolvedBuildConfig', resolvedBuildConfig);
  return resolvedBuildConfig;
}
