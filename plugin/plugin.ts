import { getCondition } from "./config/getCondition.js";
import type { VitePluginMainFn } from "./types.js";

const dir = new URL("./", import.meta.url).pathname.replace(/\/$/, "");
const condition = getCondition("");

export const { vitePluginReactServer } = (await import(`${dir}/plugin.${condition}.js`)) as {
  vitePluginReactServer: VitePluginMainFn;
};
