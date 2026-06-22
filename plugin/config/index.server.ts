// Server-side aggregator for the public ./config subpath under the react-server
// condition. The condition-neutral surface lives in index.shared.ts; this file
// adds only the react-server `createHandlerOptions` binding.
//
// IMPORTANT: do not re-export *.client.js here — ESM static linking would
// evaluate that module's transitive deps (e.g. vendor.client.js, which calls
// projectRequire("react-dom/server")), which throws under --conditions
// react-server. See bd-6pi.

export * from "./index.shared.js";

/**
 * Server-side handler options creation (RSC).
 *
 * Under react-server condition, `createHandlerOptions` is the .server
 * implementation. To explicitly access the client implementation regardless
 * of current condition, use the `./config/createHandlerOptions` subpath.
 */
export { createHandlerOptions } from "./createHandlerOptions.server.js";
export { createHandlerOptions as createHandlerOptionsServer } from "./createHandlerOptions.server.js";
