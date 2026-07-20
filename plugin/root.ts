import { proc } from "./proc.js";

export const pluginRoot = new URL("./", import.meta.url).pathname.replace(/\/$/, "");
// These probes only feed dev-time link detection, so "/" is a safe non-answer
// on a runtime without `process`.
export const userProjectRoot =
  proc?.argv
    ?.find((arg) => arg.includes("node_modules"))
    ?.match(/^(.+?)\/node_modules\/.+$/)?.[1] ||
  proc?.env?.["npm_config_local_prefix"] ||
  proc?.cwd?.() ||
  "/";
export const isLinked = !pluginRoot.startsWith(userProjectRoot);
