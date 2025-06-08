import { reactPreservePlugin } from "./preserver/plugin.js";
import { reactStaticPlugin } from "./react-static/plugin.js";
import { reactTransformPlugin } from "./transformer/plugin.server.js";
import type { StreamPluginOptions, PagePropOpt, InlineCssOpt } from "./types.js";
import { reactServerPlugin } from "./react-server/plugin.js";
import { envPlugin } from "./env/plugin.js";
import type { Plugin } from "vite";


export function vitePluginReactServer<
  T extends PagePropOpt = PagePropOpt,
  InlineCSS extends InlineCssOpt = InlineCssOpt
>(
  options = {} as StreamPluginOptions<T, InlineCSS>
): Plugin[] {
  if(!options.build?.pages || (Array.isArray(options.build.pages) && options.build.pages.length === 0)) {
    // in this case we do not need the static plugin at all
    return [
      envPlugin(),
      reactTransformPlugin(options),
      reactServerPlugin(options),
      reactPreservePlugin(options),
    ];
  }
  return [
    envPlugin(),
    reactTransformPlugin(options),
    reactServerPlugin(options),
    reactStaticPlugin(options),
    reactPreservePlugin(options),
  ];
}
