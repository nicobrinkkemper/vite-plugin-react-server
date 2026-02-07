import { getCondition } from "../config/getCondition.js";

const dir = new URL("./", import.meta.url).pathname.replace(/\/$/, "");
const condition = getCondition("");

export const { cleanupServerAction } = (await import(`${dir}/cleanupServerAction.${condition}.js`)) as {
  cleanupServerAction: any;
};