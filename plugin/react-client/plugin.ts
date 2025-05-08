import {  type Plugin } from "vite";
import type {
  AutoDiscoveredFiles,
  ResolvedUserConfig,
  ResolvedUserOptions,
  StreamPluginOptions,
} from "../types.js";
import { resolveOptions } from "../config/resolveOptions.js";
import { resolveUserConfig } from "../config/resolveUserConfig.js";
import { resolveAutoDiscover } from "../config/resolveAutoDiscover.js";
import { configureWorkerRequestHandler } from "./server.js";
import { configurePreviewServer } from "../react-static/configurePreviewServer.js";

let userOptions: ResolvedUserOptions;
let userConfig: ResolvedUserConfig;
let root: string;
let autoDiscoveredFiles: AutoDiscoveredFiles;

export function reactClientPlugin(options: StreamPluginOptions): Plugin {
  const resolvedOptions = resolveOptions(options);
  if (resolvedOptions.type === "error") {
    throw resolvedOptions.error;
  }
  userOptions = resolvedOptions.userOptions;
  root = userOptions.projectRoot;

  return {
    name: "vite:react-client",

    async config(config, configEnv) {
      if (
        typeof config.root === "string" &&
        config.root !== root &&
        config.root !== process.cwd() &&
        config.root !== ""
      ) {
        root = config.root;
      }

      const autoDiscoverResult = await resolveAutoDiscover({
        config,
        configEnv,
        userOptions,
        condition: "react-client",
      });
      if (autoDiscoverResult.type === "error") {
        throw autoDiscoverResult.error;
      }
      autoDiscoveredFiles = autoDiscoverResult.autoDiscoveredFiles;

      const resolvedConfig = resolveUserConfig({
        condition: "react-client",
        config,
        configEnv,
        userOptions,
        autoDiscoveredFiles,
      });

      if (resolvedConfig.type === "error") {
        throw resolvedConfig.error;
      }

      userConfig = resolvedConfig.userConfig;
      return userConfig;
    },

    async configurePreviewServer(server) {
      await configurePreviewServer({
        server,
        userOptions,
      });
    },
    // setup dev server
    async configureServer(server) {
      await configureWorkerRequestHandler({
        server,
        autoDiscoveredFiles,
        userOptions,
      });
    },
  };
}
