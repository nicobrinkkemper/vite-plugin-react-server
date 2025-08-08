import { getCondition } from "../config/getCondition.js";

const dir = new URL("./", import.meta.url).pathname.replace(/\/$/, "");
const condition = getCondition("");

export const { handleRscStream } = (await import(`${dir}/handleRscStream.${condition}.js`)) as {
  handleRscStream: any;
}; 