import { getCondition } from "../config/getCondition.js";
import type { VitePluginFn } from "../types.js";

const condition = getCondition("");
const dir = new URL("./", import.meta.url).pathname.replace(/\/$/, "");

const { reactStaticPlugin } = (await import(
  `${dir}/plugin.${condition}.js`
)) as { reactStaticPlugin: VitePluginFn };

export { reactStaticPlugin };
