import type { Plugin } from "vite";
import {
  resolveOptions,
  resolvePages,
  resolveUserConfig,
} from "../options.js";
import type { StreamPluginOptions } from "../types.js";

export async function reactStreamPlugin(
  options: StreamPluginOptions
): Promise<Plugin> {
  const resolvedOptions = resolveOptions(options);
  if (resolvedOptions.type === "error") {
    throw resolvedOptions.error;
  }
  const { userOptions } = resolvedOptions;

  const resolvedPages  = await resolvePages(userOptions.build.pages)
  if(resolvedPages.type === "error") {
    throw resolvedPages.error
  }
  const { pages } = resolvedPages
  return {
    name: "vite:react-stream",
    config(config, configEnv) {
      const resolvedConfig = resolveUserConfig("react-client", pages, config, configEnv, userOptions);
      if (resolvedConfig.type === "error") {
        throw resolvedConfig.error;
      }
      const { userConfig } = resolvedConfig;
      return userConfig
    },
  };
}
