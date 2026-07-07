// Server barrel: now mirrors the default/browser barrel. The browser-facing
// helpers (createReactFetcher, callServer, createCallServer) defer their
// `react-server-dom-esm/client.browser` import to call time, so they are
// import-safe under the `react-server` condition — `vite-plugin-react-server/utils`
// resolves to the same surface in both conditions. The helpers still only *run*
// in the browser; importing them here never evaluates the browser flight client.
export * from "./createReactFetcher.js";
export * from "./hydrateOrRender.js";
export * from "./useRscHmr.js";
export * from "./callServer.js";
export * from "./urls.js";
export * from "./env.js";
// Isomorphic env-bound URL helpers (absoluteURL / baseURL / pageURL): one module
// that reads import.meta.env (browser/edge, statically replaced) with a
// process.env fallback (Node/SSG), so a consumer imports them once and they work
// in every runtime — no hand-split env.server / env.client module.
export * from "./envUrls.js";
export * from "./createCallServer.js";
export * from "./routeToURL.js";
