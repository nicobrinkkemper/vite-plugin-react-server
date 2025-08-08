import { getCondition } from "../config/getCondition.js";
import type { CreateHandlerFn } from "./createHandler.types.js";
import type { CreateHtmlStreamFn } from "./createHtmlStream.types.js";
import type { CreateNodeStreamFn } from "./createNodeStream.types.js";

// Route and file handling
export * from "./getRouteFiles.js";
export * from "./resolvePage.js";
export * from "./resolveProps.js";
export * from "./resolvePageAndProps.js";
export * from "./resolveComponents.js";
export * from "./requestInfo.js";
export * from "./requestToRoute.js";

// Configuration and options
export * from "./serializeUserOptions.js";
export * from "./cleanObject.js";
export * from "./inputNormalizer.js";

// CSS handling
export * from "./collectManifestCss.js";
export * from "./collectViteModuleGraphCss.js";
export * from "./createCssProps.js";

// Stream and handler creation
// createHandler is exported via conditional import below
// resolveStreamElements is exported via conditional import below

// Hydrate user options
export * from "./hydrateUserOptions.js";

// Metrics and monitoring
export * from "./formatMetrics.js";
export * from "./metrics.js";

// Manifest handling
export * from "./tryManifest.js";
export * from "./getBundleManifest.js";

// Module handling
export * from "./moduleRefs.js";
export * from "./moduleResolver.js";

// Utility functions
export * from "./stashReturnValue.js";
export * from "./createWorkerStream.js";
export * from "./workerManager.js";

// Server action handling
// handleServerAction is exported via conditional import below

const condition = getCondition("");
const dirname = new URL("./", import.meta.url).pathname.replace(/\/$/, "");
const { createHandler } = (await import(
  `${dirname}/createHandler.${condition}.js`
)) as {
  createHandler: CreateHandlerFn
};
const { createHtmlStream } = (await import( 
  `${dirname}/createHtmlStream.${condition}.js`
)) as {
  createHtmlStream: CreateHtmlStreamFn
};
const { resolveStreamElements } = (await import(
  `${dirname}/resolveStreamElements.${condition}.js`
)) as {
  resolveStreamElements: any
};
const { createNodeStream } = (await import(
  `${dirname}/createNodeStream.${condition}.js`
)) as {
  createNodeStream: CreateNodeStreamFn
};
const { handleServerAction } = (await import(
  `${dirname}/handleServerAction.${condition}.js`
)) as {
  handleServerAction: any
};

export { createHandler, createHtmlStream, resolveStreamElements, createNodeStream, handleServerAction };
