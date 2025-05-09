import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
export const pluginRoot = dirname(fileURLToPath(import.meta.url));
export const isLinked = !import.meta.url.startsWith(process.cwd());
