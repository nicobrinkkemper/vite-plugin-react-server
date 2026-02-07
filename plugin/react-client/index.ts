import { getCondition } from "../config/getCondition.js";
import type { VitePluginFn } from "../types.js";

export * from "./types.js";

const dir = new URL("./", import.meta.url).pathname.replace(/\/$/, "");
const condition = getCondition("");

export const {
  reactClientPlugin,
} = (await import(`${dir}/index.${condition}.js`)) as {
  reactClientPlugin: VitePluginFn;
};
