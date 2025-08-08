import { getCondition } from "../config/getCondition.js";
import type { CollectHtmlContentFn } from "./types.js";

const condition = getCondition("");
const dir = new URL("./", import.meta.url);

const { collectHtmlContent } = (await import(
  `${dir}/collectHtmlContent.${condition}.js`
)) as { collectHtmlContent: CollectHtmlContentFn };

export { collectHtmlContent };
