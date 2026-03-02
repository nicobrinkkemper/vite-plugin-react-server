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
export * from "./collectManifestCss.js";
export * from "./collectViteModuleGraphCss.js";
export * from "./createCssProps.js";

// Stream and handler creation
// Stream-related functions are now exported from ../stream/index.js

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

// Utility functions

// Unified render helpers
export * from "./validateRscRenderMessage.js";
export * from "./resolveRenderUrl.js";
export * from "./mergeMessageWithDefaults.js";
export * from "./resolveWithDefaultRootAndHtml.js";
export { resolveComponents as resolveComponentsClient } from "./resolveComponents.client.js";

export * from "./logRenderStart.js";
export * from "./createSerializableHandlerOptions.js";

export * from "./createPatternMatcher.js";

export * from "./createUnifiedCssProcessor.js";

// Server action handling

const condition = getCondition("");
const dirname = new URL("./", import.meta.url).pathname.replace(/\/$/, "");

const { handleServerAction } = (await import(
  `${dirname}/handleServerAction.${condition}.js`
)) as {
  handleServerAction: any
};

export {  handleServerAction };
