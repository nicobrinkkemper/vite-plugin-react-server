import { getCondition } from "../config/getCondition.js";
import type { VitePluginFn } from "../types.js";
import type { ConfigureReactServerFn, ConfigureRequestHandlerFn, HandleServerActionFn, CleanupServerActionFn } from "./types.js";

const dir = new URL("./", import.meta.url).pathname.replace(/\/$/, "");
const condition = getCondition("");

export const {
  vitePluginReactDevServer,
  configureReactServer,
  handleServerAction,
  cleanupServerAction,
  configureRequestHandler,
} = (await import(`${dir}/index.${condition}.js`)) as {
  vitePluginReactDevServer?: VitePluginFn;
  configureReactServer?: ConfigureReactServerFn;
  handleServerAction?: HandleServerActionFn;
  cleanupServerAction?: CleanupServerActionFn;
  configureRequestHandler?: ConfigureRequestHandlerFn;
}; 