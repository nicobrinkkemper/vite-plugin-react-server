// Client-side aggregator for the public ./helpers subpath under the default
// (react-client) condition. The condition-neutral surface lives in
// index.shared.ts; this file adds the client-only resolveComponentsClient and
// the client-side handleServerAction binding.

export * from "./index.shared.js";

export { resolveComponents as resolveComponentsClient } from "./resolveComponents.client.js";

// Server action handling
export { handleServerAction } from "./handleServerAction.client.js";
