import { getCondition } from "../config/getCondition.js";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { RenderPageFn } from "./types.js";

const condition = getCondition("");
const dir = dirname(fileURLToPath(import.meta.url));

const { renderPage } = (await import(
  `${dir}/renderPage.${condition}.js`
)) as { renderPage: RenderPageFn };

export { renderPage };
