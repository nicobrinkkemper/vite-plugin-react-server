// Default barrel: same as client (includes all utils)
// Under react-server condition, package.json exports map to index.server.js
// which excludes browser-only modules.
//
// Note: the RSC-client helpers (createReactFetcher, useRscHmr, callServer,
// createCallServer) hard-import react-server-dom-esm/client.browser, which
// is declared as an optional peer. Consumers who only need the pure helpers
// (urls, env, routeToURL) can import them from `./rsc-client` instead — see
// the `./utils/rsc-client` subpath — to keep their bundle graph clear of
// the peer.
export * from "./createReactFetcher.js";
export * from "./useRscHmr.js";
export * from "./callServer.js";
export * from "./urls.js";
export * from "./env.js";
export * from "./createCallServer.js";
export * from "./routeToURL.js";
