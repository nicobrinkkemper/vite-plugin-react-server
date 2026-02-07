import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { getCondition } from "../config/getCondition.js";
import type { VitePluginFn } from "../types.js";

const dir = dirname(fileURLToPath(import.meta.url));
const condition = getCondition("");

export const { reactClientPlugin } = (await import(
  `${dir}/plugin.${condition}.js`
)) as {
  reactClientPlugin: VitePluginFn
};