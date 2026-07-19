export const pluginRoot = new URL("./", import.meta.url).pathname.replace(/\/$/, "");
// `process` is optional: this module rides into baked edge bundles via config
// imports, and these probes run at module EVALUATION — a bare `process.*` read
// crashes a runtime without one (Workers/Deno Deploy). The probes only feed
// dev-time link detection, so "/" is a safe non-answer there.
const proc = (globalThis as { process?: NodeJS.Process }).process;
export const userProjectRoot =
  proc?.argv
    ?.find((arg) => arg.includes("node_modules"))
    ?.match(/^(.+?)\/node_modules\/.+$/)?.[1] ||
  proc?.env?.["npm_config_local_prefix"] ||
  proc?.cwd?.() ||
  "/";
export const isLinked = !pluginRoot.startsWith(userProjectRoot);
