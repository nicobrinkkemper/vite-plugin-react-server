import { join } from "path";
import type { PluginContext } from "rollup";
import type { ResolvedUserConfig } from "../../server.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";

export interface BuildLoaderOptions {
  root: string;
  pluginContext: PluginContext;
  userConfig: ResolvedUserConfig;
}

export function createBuildLoader({
  root,
  userConfig,
}: BuildLoaderOptions) {
  return async (id: string) => {
    return import(join(
      root,
      userConfig.build.outDir,
      id.replace(DEFAULT_CONFIG.FILE_REGEX, "") + ".js"
    ));
  };
}
