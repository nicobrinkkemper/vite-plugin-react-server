import { getCondition } from "../config/getCondition.js";

const dir = new URL("./", import.meta.url).pathname.replace(/\/$/, "");
const condition = getCondition("");

export const { configureRequestHandler } = (await import(`${dir}/configureRequestHandler.${condition}.js`)) as {
  configureRequestHandler: any;
}; 