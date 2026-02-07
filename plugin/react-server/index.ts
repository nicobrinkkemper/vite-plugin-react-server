import type { VitePluginFn } from "../types.js";
import { getCondition } from "../config/getCondition.js";
import type { ConfigureReactServerFn, HandleServerActionFn } from "./types.js";

const condition = getCondition("");
const dir = new URL("./", import.meta.url).pathname.replace(/\/$/, "");

export const { reactServerPlugin, handleServerAction, configureReactServer } =
  (await import(`${dir}/index.${condition}.js`)) as {
    reactServerPlugin: VitePluginFn;
    handleServerAction: HandleServerActionFn;
    configureReactServer: ConfigureReactServerFn;
  };
