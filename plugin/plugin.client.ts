import { reactPreservePlugin } from "./preserver/plugin.js";   
import { reactTransformPlugin } from "./transformer/plugin.client.js";
import type { StreamPluginOptions } from "../types.js";
import { reactClientPlugin } from "./react-client/plugin.js";

export function vitePluginReactServer(options = {} as StreamPluginOptions): import("vite").Plugin[] {
    return [
      reactClientPlugin(options),
      reactTransformPlugin(options),
      reactPreservePlugin(options),
    ];
  } 