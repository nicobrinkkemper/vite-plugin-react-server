import { getCondition } from "./plugin/config/getCondition.js";
import type { VitePluginMainFn } from "./plugin/types.js";

const condition = getCondition("");
const dir = new URL(".", import.meta.url.split("/").slice(0, -1).join("/"))
  .pathname;

export const vitePluginReactServer = (await import(
  `${dir}/plugin/plugin.${condition}.js`
)) as {
  vitePluginReactServer: VitePluginMainFn;
};

// types
export type * from "./plugin/types.js";
