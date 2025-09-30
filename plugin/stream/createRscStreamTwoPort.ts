import { getCondition } from "../config/getCondition.js";
import type { ServerRscStreamOptions, ServerRscStreamResult } from "./createRscStream.types.js";

const dir = new URL("./", import.meta.url).pathname.replace(/\/$/, "");
const condition = getCondition("");

export const { createRscStreamTwoPort } = (await import(`${dir}/createRscStreamTwoPort.${condition}.js`)) as {
    createRscStreamTwoPort: (options: ServerRscStreamOptions) => ServerRscStreamResult;
}; 