import { join } from "node:path";
import type { PluginContext } from "rollup";
import type { ResolvedUserConfig, ResolvedUserOptions } from "../../server.js";
import type { Manifest } from "vite";
import { createInputNormalizer } from "../helpers/inputNormalizer.js";

export interface BuildLoaderOptions {
  root: string;
  pluginContext: PluginContext;
  userConfig: ResolvedUserConfig;
  userOptions: ResolvedUserOptions;
  serverManifest: Manifest;
  clientManifest: Manifest;
}

export function createBuildLoader({
  root,
  userConfig,
  userOptions,
  pluginContext,
  serverManifest,
  clientManifest,
}: BuildLoaderOptions) {
  const normalizer = createInputNormalizer({
    root,
    preserveModulesRoot: undefined,
    removeExtension: false,
  });
  return async function buildLoader(id: string) {
    const [key, value] = normalizer(id);
    // Remove leading slash if present
    const distDir = userOptions.build.outDir;
    const manifests = [clientManifest, serverManifest];
    // Try to find the module in the manifest
    for (const n of [0, 1]) {
      const manifest = manifests[n];
      const manifestEntry = manifest[key]
      if (!manifestEntry) {
        continue;
      }
      const isClient = userOptions.autoDiscover.clientComponents(id);
      const isServer = userOptions.autoDiscover.serverFunctions(id);
      const outDir = isClient
        ? userOptions.build.client
        : isServer
        ? userOptions.build.server
        : n === 0
        ? userOptions.build.client
        : userOptions.build.server;
      if (manifestEntry.file.startsWith(`${root}/${distDir}/${outDir}/`)) {
        return import(manifestEntry.file);
      }
      if (manifestEntry.file.startsWith(`${distDir}/`)) {
        return import(join(root, manifestEntry.file));
      }
      if (manifestEntry.file.startsWith(`${outDir}/`)) {
        return import(join(root, distDir, outDir, manifestEntry.file));
      }
      // Load the module
      return import(join(root, distDir, outDir, manifestEntry.file));
    }
    throw new Error(`Module not found: ${id}`);
  };
}
