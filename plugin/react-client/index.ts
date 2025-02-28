import { reactPreservePlugin } from "../plugin.js";
import { reactTransformPlugin } from "../transformer/plugin.js";
import type { StreamPluginOptions } from "../types.js";
import { reactClientPlugin } from "./plugin.js";

export function vitePluginReactClient(options = {} as StreamPluginOptions): import("vite").Plugin[] {
    return [
      reactClientPlugin(options),
      reactTransformPlugin(options),
      reactPreservePlugin(options),
    ];
  } 