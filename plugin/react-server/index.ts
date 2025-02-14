import { reactPreservePlugin } from "../preserver/plugin.js";
import { reactTransformPlugin } from "../transformer/plugin.js";
import type { StreamPluginOptions } from "../types.js";
import { reactServerPlugin } from "./plugin.js";

export function vitePluginReactServer(options = {} as StreamPluginOptions): import("vite").Plugin[] {
    return [
      reactTransformPlugin(options),
      reactServerPlugin(options),
      reactPreservePlugin(options),
    ];
  } 