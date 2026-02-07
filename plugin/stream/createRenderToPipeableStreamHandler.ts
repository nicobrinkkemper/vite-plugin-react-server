import { getCondition } from "../config/getCondition.js";
import type { CreateRenderToPipeableStreamHandlerFn } from "./createRenderToPipeableStreamHandler.types.js";

// Use Node.js conditions to determine which implementation to use
const condition = getCondition("");
const dirname = new URL(".", import.meta.url).pathname;

// Dynamically import the appropriate createHandler implementation
export const { createRenderToPipeableStreamHandler } = (await import(
  `${dirname}/createRenderToPipeableStreamHandler.${condition}.js`
)) as {
  createRenderToPipeableStreamHandler : CreateRenderToPipeableStreamHandlerFn
};