import { performance } from "node:perf_hooks";
import {
  type ResolvedConfig,
} from "vite";
import { resolveOptions } from "../config/resolveOptions.js";
import type {
  BuildTiming,
  VitePluginFn,
} from "../types.js";
import { assertReactServer } from "../config/getCondition.js";

assertReactServer()

export const reactServerPlugin: VitePluginFn = function _reactServerPlugin(
  options
) {
  const timing: BuildTiming = {
    start: performance.now(),
  };

  let resolvedConfig: ResolvedConfig | null = null;

  const resolvedOptions = resolveOptions(options);
  if (resolvedOptions.type === "error") {
    if(resolvedOptions.error != null) { 
      throw resolvedOptions.error;
    }
    throw new Error("React server plugin failed to resolve options");
  }
  const userOptions = resolvedOptions.userOptions;

  return {
    name: "vite:plugin-react-server/server",
    enforce: "post",
    api: {
      meta: { timing },
    },
    configResolved(_resolvedConfig) {
      resolvedConfig = _resolvedConfig;
      if (
        userOptions.projectRoot != resolvedConfig.root &&
        typeof userOptions.projectRoot === "string" &&
        userOptions.projectRoot !== ""
      ) {
        throw new Error(
          "[RSC] Project root is not the current working directory, please set projectRoot in your config.\n" +
            " projectRoot: " +
            userOptions.projectRoot +
            "\n" +
            " resolvedConfig.root: " +
            resolvedConfig.root
        );
      }
      timing.configResolved = performance.now();
    },
    async handleHotUpdate({ file, server, timestamp, ...ctx }) {
      try {
        // Invalidate the module in Vite's cache for both client and SSR
        if (server.moduleGraph) {
          const mod = server.moduleGraph.getModuleById(file);
          if (mod) {
            // Invalidate the parent module which will handle both client and SSR
            server.moduleGraph.invalidateModule(
              mod,
              undefined,
              timestamp,
              true
            );

            // Force a reload of the module
            const newMod = await server.moduleGraph.ensureEntryFromUrl(
              file,
              false
            );
            if (newMod) {
              server.moduleGraph.invalidateModule(
                newMod,
                undefined,
                timestamp,
                true
              );
            }
          }
        }
      } catch (error) {
        if(error != null) {
          throw error;
        }
        throw new Error("Failed to handle hot update");
        
      }
      return ctx.modules;
    },
  };
};
