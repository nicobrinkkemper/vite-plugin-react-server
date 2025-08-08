import { getCondition } from "./config/getCondition.js";
import type { VitePluginMainFn } from "./types.js"; 

const condition = getCondition("");
const dir = new URL(".", import.meta.url.split("/").slice(0, -1).join("/"))
  .pathname;

export const { vitePluginReactServer } = (await import(
  `${dir}/plugin.${condition}.js`
)) as { vitePluginReactServer: VitePluginMainFn };
