import { reactPreservePlugin } from "./preserver/plugin.js";
import type {
  StreamPluginOptions,
  InlineCssOpt,
  PagePropOpt,
} from "../types.js";
import { reactClientPlugin } from "./react-client/plugin.js";
import { envPlugin } from "./env/plugin.js";
import type { Plugin } from "vite";

export function vitePluginReactServer<
  T extends PagePropOpt = PagePropOpt,
  InlineCSS extends InlineCssOpt = InlineCssOpt
>(options = {} as StreamPluginOptions<T, InlineCSS>): Plugin[] {
  return [
    envPlugin(),
    reactClientPlugin(options),
    reactPreservePlugin(options),
  ];
}
