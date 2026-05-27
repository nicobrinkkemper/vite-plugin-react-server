// Public `vite-plugin-react-server/utils` barrel — pure helpers only.
//
// RSC-client helpers (createReactFetcher, callServer, createCallServer,
// useRscHmr) live in ./rsc-client.ts and are re-exported from the
// `vite-plugin-react-server/utils/rsc-client` subpath. They are kept out of
// this barrel because they hard-import react-server-dom-esm/client.browser,
// which vprs declares as an *optional* peer dependency. Re-exporting them
// here forced every bundler that resolved `./utils` (e.g. Storybook in a
// browser app) to resolve react-server-dom-esm even when the consumer never
// invoked an RSC-client utility — see issue #51.
export * from "./urls.js";
export * from "./env.js";
export * from "./routeToURL.js";
