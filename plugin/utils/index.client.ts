// Kept as a build-only artifact path. The exports map points the `browser`
// condition at ./index.js (built from ./index.ts), so this file is no longer
// part of any public entry. Mirroring ./index.ts so an accidental deep import
// (`vite-plugin-react-server/utils/index.client`) still resolves to the same
// pure-helpers shape as the public ./utils barrel.
export * from "./urls.js";
export * from "./env.js";
export * from "./routeToURL.js";
