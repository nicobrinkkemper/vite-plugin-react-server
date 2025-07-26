import { getCondition } from "../config/getCondition.js";

// Route and file handling
export * from "./getRouteFiles.js";
export * from "./resolvePage.js";
export * from "./resolveProps.js";
export * from "./resolvePageAndProps.js";
export * from "./requestInfo.js";
export * from "./requestToRoute.js";

// Configuration and options
export * from "./serializeUserOptions.js";
export * from "./cleanObject.js";
export * from "./inputNormalizer.js";

// CSS handling
export * from "./collectBundleManifestCss.js";
export * from "./collectManifestCss.js";
export * from "./collectViteModuleGraphCss.js";
export * from "./createCssProps.js";

// Stream and handler creation
export * from "./createHandler.server.js";

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

const condition = getCondition('')
const dirname = new URL('.', import.meta.url).pathname;
const createRscStream = await import(`${dirname}/createRscStream.${condition}.js`);
const createHandler = await import(`${dirname}/createHandler.${condition}.js`);

export { createRscStream, createHandler };