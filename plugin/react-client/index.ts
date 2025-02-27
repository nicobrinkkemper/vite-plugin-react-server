import { reactPreservePlugin } from "../plugin.js";
import { reactTransformPlugin } from "../transformer/plugin.js";
import type { StreamPluginOptions } from "../types.js";
import { reactClientPlugin } from "./plugin.js";

export function vitePluginReactClient(options = {} as StreamPluginOptions): import("vite").Plugin[] {
    return [
      reactPreservePlugin(options),
      reactClientPlugin(options),
      reactTransformPlugin(options),
    ];
  } 