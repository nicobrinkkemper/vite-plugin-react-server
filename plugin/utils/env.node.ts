// Node / SSG / edge env source. Selected under the default condition
// (package.json `imports` → `#env`) — i.e. everywhere `import.meta.env` is not a
// real, injected object (vprs is external in bare Node, so it's undefined). Read
// the values vprs's config mirrors into `process.env` instead. No
// `import.meta.env` here at all, so nothing to throw or leave undefined.
const p: NodeJS.ProcessEnv | undefined =
  typeof process !== "undefined" ? process.env : undefined;

// Getters, not a frozen snapshot: this module loads with the plugin, BEFORE the
// config resolvers mirror the resolved base into process.env — a value captured
// at import time would stay "/" for the whole build, and every emission-time
// reader (bootstrapModules, SSG URLs) would build un-prefixed URLs while Vite's
// own pipeline prefixes the rest of the same HTML.
export const env = {
  // `||` (not `??`): an empty VITE_BASE_URL still means the root base "/".
  get BASE_URL() {
    return p?.["VITE_BASE_URL"] || "/";
  },
  get PUBLIC_ORIGIN() {
    return p?.["VITE_PUBLIC_ORIGIN"] ?? "";
  },
  get DEV() {
    return p?.["NODE_ENV"] !== "production";
  },
  get MODE() {
    return p?.["NODE_ENV"] ?? "production";
  },
  get PROD() {
    return p?.["NODE_ENV"] === "production";
  },
  SSR: true,
} as ImportMetaEnv;
