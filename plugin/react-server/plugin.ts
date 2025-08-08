import type { VitePluginMainFn } from "../types.js";
import { getCondition } from "../config/getCondition.js";

const condition = getCondition("");
const dir = new URL(".", import.meta.url)
  .pathname;

export const { reactServerPlugin } = (await import(
  `${dir}/plugin.${condition}.js`   
)) as { reactServerPlugin: VitePluginMainFn };
