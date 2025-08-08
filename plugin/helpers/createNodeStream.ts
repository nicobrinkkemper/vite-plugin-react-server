import { getCondition } from "../config/getCondition.js";
import type { CreateNodeStreamFn } from "./createNodeStream.types.js";

// Use Node.js conditions to determine which implementation to use
const condition = getCondition("");
const dirname = new URL("./", import.meta.url).pathname.replace(/\/$/, "");

// Dynamically import the appropriate createNodeStream implementation
let createNodeStream: CreateNodeStreamFn;

try {
  const module = await import(
    `${dirname}/createNodeStream.${condition}.js`
  );
  createNodeStream = module.createNodeStream;
} catch (error) {
  throw new Error(
    `Failed to import createNodeStream for condition "${condition}": ${error}`
  );
}

export { createNodeStream }; 