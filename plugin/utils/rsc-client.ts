// `vite-plugin-react-server/utils/rsc-client` barrel — RSC-client helpers
// for browser apps that build an RSC client (createReactFetcher, callServer,
// createCallServer, useRscHmr).
//
// These all hard-import react-server-dom-esm/client.browser, which vprs
// declares as an *optional* peer dependency. Consumers that pull this
// subpath are opting in to that dependency: they must have react-server-dom-esm
// resolvable in the bundle graph (typically via the vprs Vite plugin's own
// resolver, or by installing it directly).
export * from "./createReactFetcher.js";
export * from "./useRscHmr.js";
export * from "./callServer.js";
export * from "./createCallServer.js";
