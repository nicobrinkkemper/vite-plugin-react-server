// Client-side aggregator for the public ./config subpath under the default
// (react-client) condition. The condition-neutral surface lives in
// index.shared.ts; this file adds only the react-client `createHandlerOptions`
// binding.
//
// IMPORTANT: do not re-export *.server.js here — that would statically link the
// .server implementation, wrong under react-client and undermining the
// conditional exports map.

export * from "./index.shared.js";

/**
 * Client-side handler options creation (HTML generation).
 *
 * Under the default (react-client) condition, `createHandlerOptions` is the
 * .client implementation. To explicitly access the server implementation,
 * use the `./config/createHandlerOptions` subpath under react-server.
 */
export { createHandlerOptions } from "./createHandlerOptions.client.js";
export { createHandlerOptions as createHandlerOptionsClient } from "./createHandlerOptions.client.js";
