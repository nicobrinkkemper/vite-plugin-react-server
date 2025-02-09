import type { Plugin as VitePlugin, UserConfig } from "vite";

import type { ResolvedUserOptions, StreamPluginOptions } from "../types.js";
import { resolveOptions } from "../config/resolveOptions.js";
import { resolveUserConfig } from "../config/resolveUserConfig.js";

let userOptions: ResolvedUserOptions;

export function reactClientPlugin(options: StreamPluginOptions): VitePlugin {
  const resolvedOptions = resolveOptions(options);
  if (resolvedOptions.type === "error") {
    throw resolvedOptions.error;
  }
  userOptions = resolvedOptions.userOptions;

  return {
    name: "vite:react-stream-client",
    async config(config): Promise<UserConfig> {
      const resolvedConfig = resolveUserConfig({
        condition: "react-client",
        config,
        configEnv: { command: "build", mode: "production" },
        userOptions,
      });

      if (resolvedConfig.type === "error") {
        throw resolvedConfig.error;
      }

      return resolvedConfig.userConfig;
    }
  };
}
