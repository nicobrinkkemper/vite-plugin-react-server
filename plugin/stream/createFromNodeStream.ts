import { getCondition } from "../config/getCondition.js";
import type { CreateFromNodeStreamFn } from "./createFromNodeStream.types.js";

// Use Node.js conditions to determine which implementation to use
const condition = getCondition("");
const dirname = new URL(".", import.meta.url).pathname;

// Dynamically import the appropriate createHtmlStream implementation
export const { createFromNodeStream } = (await import(
  `${dirname}/createFromNodeStream.${condition}.js`
)) as {
  createFromNodeStream: CreateFromNodeStreamFn;
};