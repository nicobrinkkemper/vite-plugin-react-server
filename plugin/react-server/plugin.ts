import { performance } from "node:perf_hooks";
import {
  type ResolvedConfig,
  type UserConfig,
  type ViteDevServer,
  type Manifest,
  type Plugin as VitePlugin,
} from "vite";
import { resolveOptions } from "../config/resolveOptions.js";
import { resolveUserConfig } from "../config/resolveUserConfig.js";
import type {
  AutoDiscoveredFiles,
  BuildTiming,
  ReactStreamPluginMeta,
  ResolvedUserOptions,
} from "../types.js";
import { type StreamPluginOptions } from "../types.js";
import {
  resolveAutoDiscover
} from "../config/resolveAutoDiscover.js";
import { getCondition } from "../config/getCondition.js";
import { configureReactServer } from "./server.js";
import { configurePreviewServer } from "../react-static/configurePreviewServer.js";

let resolvedConfig: ResolvedConfig | null = null;
let cwd: string;

if (getCondition() !== "react-server") {
  throw new Error(
    "Condition mismatch, should be react-server but got " +
      process.env["NODE_OPTIONS"]
  );
}
export function reactServerPlugin(options: StreamPluginOptions): VitePlugin<{
  meta: ReactStreamPluginMeta;
}> {
  const timing: BuildTiming = {
    start: performance.now(),
  };

  let autoDiscoveredFiles: AutoDiscoveredFiles;
  let userOptions: ResolvedUserOptions;
  let serverManifest: Manifest = {};

  const resolvedOptions = resolveOptions(options);
  if (resolvedOptions.type === "error") {
    throw resolvedOptions.error;
  }
  userOptions = resolvedOptions.userOptions;
  cwd = process.cwd();
  if (
    userOptions.projectRoot != cwd &&
    typeof userOptions.projectRoot === "string" &&
    userOptions.projectRoot !== ""
  ) {
    throw new Error(
      "[RSC] Project root is not the current working directory, please set projectRoot in your config"
    );
  }

  return {
    name: "vite:react-stream-server",
    enforce: "post",
    api: {
      meta: { timing },
    },
    configResolved(_resolvedConfig) {
      resolvedConfig = _resolvedConfig;
      timing.configResolved = performance.now();

      // Verify transformer runs first, preserver runs last
      const plugins = resolvedConfig.plugins;
      const transformerIndex = plugins.findIndex(
        (p) => p.name === "vite:react-server-transform"
      );
      const preserverIndex = plugins.findIndex(
        (p) => p.name === "vite-plugin-react-server:preserve-directives"
      );

      if (transformerIndex === -1) {
        throw new Error("Transformer plugin not installed");
      }
      if (preserverIndex < transformerIndex) {
        throw new Error(
          "Transformer plugin isn't installed or isn't running before preserver"
        );
      }
    },

    async configurePreviewServer(server) {
      await configurePreviewServer({
        server,
        userOptions,
      });
    },
    async configureServer(server: ViteDevServer) {
      configureReactServer({
        server,
        autoDiscoveredFiles,
        userOptions,
        serverManifest,
      });
    },
    async config(config, configEnv): Promise<UserConfig> {
      const autoDiscoverResult = await resolveAutoDiscover({
        config,
        configEnv,
        userOptions,
        condition: "react-server",
      });
      if (autoDiscoverResult.type === "error") {
        throw autoDiscoverResult.error;
      }
      autoDiscoveredFiles = autoDiscoverResult.autoDiscoveredFiles;

      const resolvedConfig = resolveUserConfig({
        condition: "react-server",
        config,
        configEnv,
        userOptions,
        autoDiscoveredFiles,
      });

      if (resolvedConfig.type === "error") {
        console.error(
          "[react-server-plugin] Failed to resolve config:",
          resolvedConfig.error
        );
        throw resolvedConfig.error;
      }

      return resolvedConfig.userConfig;
    },
    async buildStart() {
      if (!timing.buildStart) {
        timing.buildStart = performance.now();
      } else {
        console.log("Build already started");
      }
    },
    async handleHotUpdate({ file, server, read, timestamp, ...ctx }) {
      // Check if the file is a page or props file
      const isPageFile = userOptions.autoDiscover.modulePattern(file);
      if (!isPageFile) return;

      // Get the route for this file
      const [, value] = userOptions.normalizer(file);
      
      // Find all routes affected by this file change
      const affectedRoutes = autoDiscoveredFiles.routeMap.get(value) || [];
      
      // Notify the worker about the update
      if (server.hot) {
        server.hot.send('custom', {
          type: 'HMR_UPDATE',
          path: file,
          timestamp,
          routes: affectedRoutes
        });
      }

      // Return the affected modules for Vite to handle
      return ctx.modules;
    },
  };
}
