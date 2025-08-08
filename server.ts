"use strict";

import { getCondition } from "./plugin/config/getCondition.js";
import type { VitePluginMainFn } from "./plugin/types.js";

const condition = getCondition("");
// no trailing slash
const dir = new URL("./", import.meta.url).pathname.replace(/\/$/, "");

export const { vitePluginReactServer, vitePluginReactClient } = (await import(
  `${dir}/plugin/plugin.${condition}.js`
)) as {
  vitePluginReactServer: VitePluginMainFn;
  vitePluginReactClient: VitePluginMainFn;
};

// types
export type * from "./plugin/types.js";
export type * from "./plugin/react-server/types.js";
