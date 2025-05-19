import { reactPreservePlugin } from "./preserver/plugin.js";   
import { reactTransformPlugin } from "./transformer/plugin.client.js";
import type { StreamPluginOptions } from "../types.js";
import { reactClientPlugin } from "./react-client/plugin.js";
import { envPlugin } from "./env/plugin.js";

export function vitePluginReactServer(options = {} as StreamPluginOptions): import("vite").Plugin[] {
    return [
      envPlugin(),
      reactClientPlugin(options),
      reactTransformPlugin(options),
      reactPreservePlugin(options),
    ];
  } 