import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { InlineConfig } from "vite";
import { DEFAULT_CONFIG } from "../options.js";
import type { StreamPluginOptions } from "../types.js";
const __dirname = dirname(fileURLToPath(import.meta.url));

type CreateBuildConfigOptions = {
  root: string;
  base: string;
  outDir: string;
  entries: string[];
  options?: StreamPluginOptions;
};

export function createBuildConfig({
  root,
  base,
  outDir,
  entries,
  options,
}: CreateBuildConfigOptions) {
  // Transform entries into proper input format with unique keys
  const entryInputs = Object.fromEntries(
    entries.map((entry) => {
      // Get the path relative to root
      const relativePath = entry.replace(root + "/", "");
      // Create a unique key based on the full path
      const key = relativePath.replace(/\.[^/.]+$/, ""); // Remove extension

      return [key, entry];
    })
  );

  const workerPath = options?.workerPath
    ? resolve(root, options.workerPath)
    : resolve(__dirname, "..", DEFAULT_CONFIG.WORKER_PATH);

  const loaderPath = options?.loaderPath
    ? resolve(root, options.loaderPath)
    : resolve(__dirname, "..", DEFAULT_CONFIG.LOADER_PATH);

  const config: InlineConfig = {
    configFile: false,
    root,
    base,
    build: {
      target: "node18",
      ssr: true,
      ssrEmitAssets: false,
      manifest: true,
      ssrManifest: true,
      outDir,
      rollupOptions: {
        input: {
          ...entryInputs,
          worker: workerPath,
          loader: loaderPath,
        },
        output: {
          format: "esm",
          preserveModules: true,
          hoistTransitiveImports: false,
          esModule: true,
          entryFileNames: "[name].js",
          chunkFileNames: "[name].js",
          assetFileNames: "[name][extname]",
        },
      },
    },
  };

  return config;
}
