// Node / SSG / edge env source. Selected under the default condition
// (package.json `imports` → `#env`) — i.e. everywhere `import.meta.env` is not a
// real, injected object (vprs is external in bare Node, so it's undefined). Read
// the values vprs's config mirrors into `process.env` instead. No
// `import.meta.env` here at all, so nothing to throw or leave undefined.
const p: NodeJS.ProcessEnv | undefined =
  typeof process !== "undefined" ? process.env : undefined;

export const env = {
  // `||` (not `??`): an empty VITE_BASE_URL still means the root base "/".
  BASE_URL: p?.["VITE_BASE_URL"] || "/",
  PUBLIC_ORIGIN: p?.["VITE_PUBLIC_ORIGIN"] ?? "",
  DEV: p?.["NODE_ENV"] !== "production",
  MODE: p?.["NODE_ENV"] ?? "production",
  PROD: p?.["NODE_ENV"] === "production",
  SSR: true,
} as ImportMetaEnv;
