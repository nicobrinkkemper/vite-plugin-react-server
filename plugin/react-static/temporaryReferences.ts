import { getCondition } from "../config/getCondition.js";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const condition = getCondition("");
console.log("🔍 Static plugin condition:", condition);
const dir = dirname(fileURLToPath(import.meta.url));

const { temporaryReferences } = (await import(
  `${dir}/temporaryReferences.${condition}.js`
)) as { temporaryReferences: WeakMap<any, any> | Set<any> };

export { temporaryReferences };
