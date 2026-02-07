import { getCondition } from "./plugin/config/getCondition.js";
import type {
  VitePluginReactClientFn,
  VitePluginReactServerFn,
} from "./plugin/types.js";

const condition = getCondition("");
// no trailing slash
const dir = new URL("./", import.meta.url).pathname.replace(/\/$/, "");

console.log(`[index.ts] Condition: ${condition}, importing: ${dir}/plugin/plugin.${condition}.js`);

export const { vitePluginReactServer, vitePluginReactClient } = (await import(
  `${dir}/plugin/plugin.${condition}.js`
)) as {
  vitePluginReactServer: VitePluginReactServerFn;
  vitePluginReactClient: VitePluginReactClientFn;
};

// types
export type * from "./plugin/types.js";
