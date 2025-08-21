import { getCondition } from "../config/getCondition.js";

const dir = new URL("./", import.meta.url).pathname.replace(/\/$/, "");
const condition = getCondition("");

export const { restartWorker } = (await import(`${dir}/restartWorker.${condition}.js`)) as {
  restartWorker: any;
}; 