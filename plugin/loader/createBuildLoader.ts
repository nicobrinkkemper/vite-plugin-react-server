import { join, relative } from "path";
import type { PluginContext } from "rollup";
import type { ResolvedUserConfig } from "../../server.js";
import { createInputNormalizer } from "../helpers/inputNormalizer.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { mkdir, stat, writeFile } from "node:fs/promises";

export interface BuildLoaderOptions {
  root: string;
  pluginContext: PluginContext;
  userConfig: ResolvedUserConfig;
}

export function createBuildLoader({
  root,
  pluginContext,
  userConfig,
}: BuildLoaderOptions) {
  const normalizer = createInputNormalizer(root);
  return async (id: string) => {
    console.log("[createBuildLoader] Loading module:", id);
    const moduleId = join(root, id);

    // Load the module source
    const result = await pluginContext.load({ id: moduleId });
    if (!result) {
      throw new Error(`Failed to load module: ${id}`);
    }
    let destination = id.replace(DEFAULT_CONFIG.FILE_REGEX, "") + ".js";
    let fullDestination = join(root, userConfig.build.outDir, destination);


    // Import and evaluate the module
    try {
      let emitIfNotExists = await stat(fullDestination).then(stats => stats.isFile());
      if (emitIfNotExists) {
        console.log(
          "[createBuildLoader] Emitting file:",
          id,
          pluginContext.getModuleInfo(id),
          pluginContext.getWatchFiles(),
          destination,
          emitIfNotExists
        );
      }
      return await import(fullDestination);
    } catch (error) {
      console.log(
        "[createBuildLoader] A file wasn't emitted, emitting now",
        error
      );
      console.log("[createBuildLoader] Module doesn't exist, emitting it", fullDestination, result.code);
      await mkdir(join(root, userConfig.build.outDir), { recursive: true });

      await writeFile(fullDestination, result.code ?? "");
      console.log("[createBuildLoader] Emitted file:", fullDestination);
      return await import(fullDestination);
    }
  };
}
