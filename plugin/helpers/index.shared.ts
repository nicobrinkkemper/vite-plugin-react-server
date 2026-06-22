// Condition-neutral surface shared by the public ./helpers barrel under BOTH
// conditions. Only modules that are import-safe under react-server AND
// react-client belong here. The per-condition residue lives in
// index.{server,client}.ts: the `handleServerAction` binding, and the client-only
// `resolveComponentsClient` (re-exporting resolveComponents.client under
// react-server would static-link vendor.client -> react-dom/server and crash —
// see bd-6pi).

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

// Unified render helpers
export * from "./validateRscRenderMessage.js";
export * from "./resolveRenderUrl.js";
export * from "./mergeMessageWithDefaults.js";
export * from "./resolveWithDefaultRootAndHtml.js";

export * from "./logRenderStart.js";
export * from "./createSerializableHandlerOptions.js";
export * from "./createPatternMatcher.js";
export * from "./createUnifiedCssProcessor.js";
