import type { Plugin } from "vite";
import { getCondition } from "../config/getCondition.js";

const dir = new URL("./", import.meta.url).pathname.replace(/\/$/, "");
const condition = getCondition("");

export const { envPlugin } = (await import(`${dir}/plugin.${condition}.js`)) as {
  envPlugin: () => Plugin;
};

export * from './plugin.js';
export * from './userConfigEnv.js'; 
export * from './getArgValue.js';
export * from './createConfigEnv.js';