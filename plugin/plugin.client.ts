import { reactPreservePlugin } from "./preserver/plugin.js";
import { reactTransformPlugin } from "./transformer/plugin.client.js";
import type {
  StreamPluginOptions,
  InlineCssOpt,
  PagePropOpt,
} from "../types.js";
import { reactClientPlugin } from "./react-client/plugin.js";
import { envPlugin } from "./env/plugin.js";

export function vitePluginReactServer<
  T extends PagePropOpt = PagePropOpt,
  InlineCSS extends InlineCssOpt = InlineCssOpt
>(options = {} as StreamPluginOptions<T, InlineCSS>): import("vite").Plugin[] {
  return [
    envPlugin(),
    reactClientPlugin(options),
    reactTransformPlugin(options),
    reactPreservePlugin(options),
  ];
}
