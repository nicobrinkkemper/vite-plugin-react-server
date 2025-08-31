import { performance } from "node:perf_hooks";

import { resolveOptions } from "../config/resolveOptions.js";
import type {
  BuildTiming,
  VitePluginFn,
} from "../types.js";
import { createDefaultModuleID } from "../config/createModuleID.js";
import { assertNonReactServer } from "../config/getCondition.js";
assertNonReactServer();

export const reactServerPlugin: VitePluginFn =
  function _reactServerPluginForClient(options) {
    const timing: BuildTiming = {
      start: performance.now(),
    };


    const resolvedOptions = resolveOptions(options);
    if (resolvedOptions.type === "error") {
      if (resolvedOptions.error != null) {
        throw resolvedOptions.error;
      }
      throw new Error("Failed to resolve options");
    }
    let currentUserOptions = resolvedOptions.userOptions;
    return {
      name: "vite:plugin-react-server/rsc-worker-server",
      enforce: "post",
      api: {
        meta: { timing },
      },
      applyToEnvironment(partialEnvironment) {
        if (['server', 'client', 'ssr'].includes(partialEnvironment.name)) {
          return true;
        }
        return false;
      },
      config(config, viteConfigEnv) {
        // Set up moduleID function if not already set
        if (typeof currentUserOptions.moduleID !== "function") {
          currentUserOptions.moduleID = createDefaultModuleID(
            currentUserOptions,
            viteConfigEnv,
            currentUserOptions.loader?.mode
          );
        }
        
        // The environment plugin handles auto-discovery and input configuration
        // This plugin now focuses on server-specific functionality
        return config; 
      },
  };
};
