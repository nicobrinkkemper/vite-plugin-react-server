import { getCondition } from "../config/getCondition.js";

const dir = new URL("./", import.meta.url).pathname.replace(/\/$/, "");
const condition = getCondition("");

export const { createRscStream } = (await import(`${dir}/createRscStream.${condition}.js`)) as {
  createRscStream: any;
}; 