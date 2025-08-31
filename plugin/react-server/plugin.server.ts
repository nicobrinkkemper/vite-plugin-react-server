import { performance } from "node:perf_hooks";
import type {
  BuildTiming,
  VitePluginFn,
} from "../types.js";
import { assertReactServer } from "../config/getCondition.js";

assertReactServer()

export const reactServerPlugin: VitePluginFn = function _reactServerPlugin(
  _options
) {
  const timing: BuildTiming = {
    start: performance.now(),
  };

  return {
    name: "vite:plugin-react-server/server",
    enforce: "post",
    api: {
      meta: { timing },
    },
    configResolved(_resolvedConfig) {
      timing.configResolved = performance.now();
    },
  };
};
