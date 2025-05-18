import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
export const pluginRoot = dirname(fileURLToPath(import.meta.url));
export const userProjectRoot =
  process.argv
    .find((arg) => arg.includes("node_modules"))
    ?.match(/^(.+?)\/node_modules\/.+$/)?.[1] ||
  process.env["npm_config_local_prefix"] ||
  process.cwd();
export const isLinked = !pluginRoot.startsWith(userProjectRoot);