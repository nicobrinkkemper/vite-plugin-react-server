import { getCondition } from "../config/getCondition.js";

const dir = new URL("./", import.meta.url).pathname.replace(/\/$/, "");
const condition = getCondition("");

export const {
  configureReactServer,
  handleServerAction,
  handleRscStream,
  createRscStream,
} = (await import(`${dir}/index.${condition}.js`)) as {
  configureReactServer?: any;
  handleServerAction: any;
  handleRscStream: any;
  createRscStream: any;
}; 