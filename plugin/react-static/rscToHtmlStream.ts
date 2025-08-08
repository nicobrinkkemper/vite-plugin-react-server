import { getCondition } from "../config/getCondition.js";
import type { RscToHtmlStreamFn } from "./types.js";

const condition = getCondition("");
const dir = new URL("./", import.meta.url);

const { createRscToHtmlStream } = (await import(
  `${dir}/rscToHtmlStream.${condition}.js`
)) as { createRscToHtmlStream: RscToHtmlStreamFn };

export { createRscToHtmlStream };
