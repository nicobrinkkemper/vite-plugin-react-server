import { getCondition } from "../config/getCondition.js";
import type { ResolveStreamElementsFn } from "./resolveStreamElements.types.js";

// Use Node.js conditions to determine which implementation to use
const condition = getCondition("");
const dirname = new URL(".", import.meta.url).pathname;

// Dynamically import the appropriate resolveStreamElements implementation
export const { resolveStreamElements } = (await import(
  `${dirname}/resolveStreamElements.${condition}.js`
)) as {
  resolveStreamElements: ResolveStreamElementsFn;
}; 