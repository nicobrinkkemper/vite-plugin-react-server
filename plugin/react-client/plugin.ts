import { type Manifest, type Plugin, type ResolvedConfig } from "vite";
import type {
  AutoDiscoveredFiles,
  ResolvedUserConfig,
  ResolvedUserOptions,
  StreamPluginOptions,
} from "../types.js";
import { resolveOptions } from "../config/resolveOptions.js";
import { resolveUserConfig } from "../config/resolveUserConfig.js";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getBundleManifest } from "../helpers/getBundleManifest.js";

import { resolveAutoDiscover } from "../config/resolveAutoDiscover.js";
import { configureWorkerRequestHandler } from "./server.js";
import { configurePreviewServer } from "../react-static/configurePreviewServer.js";

let userOptions: ResolvedUserOptions;
let userConfig: ResolvedUserConfig;
let clientManifest: Manifest = {};
let resolvedConfig: ResolvedConfig;
let root: string;
let autoDiscoveredFiles: AutoDiscoveredFiles;

export function reactClientPlugin(options: StreamPluginOptions): Plugin {
  const resolvedOptions = resolveOptions(options, "react-client");
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
        root,
        normalizer: userOptions.normalizer,
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

    configResolved(config) {
      resolvedConfig = config;
    },

    async generateBundle(_options, bundle) {
      // Create manifest entries for each chunk
      clientManifest = getBundleManifest<false>({
        bundle,
        normalizer: userOptions.normalizer,
      });

      // Write manifest immediately after generation
      const manifestPath = join(
        root,
        resolvedConfig.environments["client"].build.outDir as string,
        resolvedConfig.environments["client"].build.manifest as string
      );
      await mkdir(dirname(manifestPath), { recursive: true });

      return await writeFile(
        manifestPath,
        JSON.stringify(clientManifest, null, 2)
      );
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
