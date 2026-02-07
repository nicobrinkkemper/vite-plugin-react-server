import { getCondition } from "../config/getCondition.js";

const dir = new URL("./", import.meta.url).pathname.replace(/\/$/, "");
const condition = getCondition("");

export const { configureReactServer } = (await import(`${dir}/configureReactServer.${condition}.js`)) as {
  configureReactServer: any;
}; 