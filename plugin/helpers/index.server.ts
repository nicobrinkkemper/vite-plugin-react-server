// Server-side aggregator for the public ./helpers subpath under react-server.
// The condition-neutral surface lives in index.shared.ts; this file adds only
// the server-side handleServerAction binding.
//
// resolveComponents.client is intentionally NOT re-exported here: under
// react-server, ESM static linking would evaluate the .client module's
// transitive deps (vendor.client.js -> react-dom/server) and crash. See bd-6pi.

export * from "./index.shared.js";

// Server action handling
export { handleServerAction } from "./handleServerAction.server.js";
