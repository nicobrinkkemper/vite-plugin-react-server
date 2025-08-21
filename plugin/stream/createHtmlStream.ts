import { getCondition } from "../config/getCondition.js";
import type { CreateHtmlStreamFn } from "./createHtmlStream.types.js";

// Use Node.js conditions to determine which implementation to use
const condition = getCondition("");
const dirname = new URL(".", import.meta.url).pathname;

// Dynamically import the appropriate createHtmlStream implementation
export const { createHtmlStream } = (await import(
  `${dirname}/createHtmlStream.${condition}.js`
)) as {
  createHtmlStream: CreateHtmlStreamFn;
};