import { getCondition } from "../config/getCondition.js";

const condition = getCondition("");
const dir = new URL("./", import.meta.url);

export const {
  reactStaticPlugin,
  renderPage,
  temporaryReferences,
  createBuildLoader,
  rscToHtmlStream
} = await import(`${dir}/index.${condition}.js`);

export { fileWriter } from "./fileWriter.js";
export { renderPages } from "./renderPages.js";
export { configurePreviewServer } from "./configurePreviewServer.js";
export { collectRscContent } from "./collectRscContent.js";