import { getCondition } from "../config/getCondition.js";

const dir = new URL("./", import.meta.url).pathname.replace(/\/$/, "");
const condition = getCondition("");

export const { handleServerAction } = (await import(`${dir}/handleServerAction.${condition}.js`)) as {
  handleServerAction: any;
}; 