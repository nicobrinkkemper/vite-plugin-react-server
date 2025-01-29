import type { Plugin } from "vite";
import {
  resolveOptions,
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


  return {
    name: "vite:react-stream",
    config(config, configEnv) {
      const resolvedConfig = resolveUserConfig("react-client", config, configEnv, userOptions);
      if (resolvedConfig.type === "error") {
        throw resolvedConfig.error;
      }
      const { userConfig } = resolvedConfig;
      return userConfig
    },
  };
}
