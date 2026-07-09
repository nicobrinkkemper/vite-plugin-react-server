// Default barrel — includes every util, and index.server.ts now exposes the
// same surface, so `vite-plugin-react-server/utils` resolves identically under
// either condition. The browser-facing helpers (createReactFetcher, callServer,
// createCallServer) load `react-server-dom-esm/client.browser` lazily at call
// time, which keeps this barrel import-safe under `react-server`; they still
// only run in the browser.
//
// The `./utils/rsc-client` subpath re-exports just the RSC-client helpers
// (createReactFetcher, callServer) for browser apps that want them in isolation.
export * from "./createReactFetcher.js";
export * from "./hydrateOrRender.js";
export * from "./useRscHmr.js";
export * from "./callServer.js";
export * from "./urls.js";
export * from "#env";
export * from "./envUrls.js";
export * from "./createCallServer.js";
export * from "./routeToURL.js";
