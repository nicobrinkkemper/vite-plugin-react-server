import { getCondition } from "../config/getCondition.js";
import type { CreateHandlerFn } from "./createHandler.types.js";

// Use Node.js conditions to determine which implementation to use
const condition = getCondition("");
const dirname = new URL(".", import.meta.url).pathname;

// Dynamically import the appropriate createHandler implementation
export const { createHandler } = (await import(
  `${dirname}/createHandler.${condition}.js`
)) as {
  createHandler: CreateHandlerFn
};