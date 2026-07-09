// Browser env source. Selected under the `browser` condition (package.json
// `imports` → `#env`), so this file is ONLY ever loaded in a browser bundle,
// never in Node. Each `import.meta.env` dot-access is statically replaced by the
// consumer's Vite (vprs's self-referential define ships them unparsed from vprs's
// own build), so the emitted object is plain values — no runtime `import.meta.env`
// left to be undefined, no guard needed.
//
// Defaults mirror env.node: an unset PUBLIC_ORIGIN must be "" (not undefined) and
// an unset BASE_URL must be "/", or downstream string-building like
// `${PUBLIC_ORIGIN}${BASE_URL}` (moduleBaseURL) yields "undefined/" and breaks
// asset/flight URLs on client navigation.
export const env = {
  BASE_URL: import.meta.env.BASE_URL || "/",
  PUBLIC_ORIGIN: import.meta.env.PUBLIC_ORIGIN ?? "",
  DEV: import.meta.env.DEV,
  MODE: import.meta.env.MODE,
  PROD: import.meta.env.PROD,
  SSR: import.meta.env.SSR,
} as ImportMetaEnv;
