import { createAbsoluteURL, createBaseURL, createPageURL } from "./urls.js";

// Isomorphic env-bound URL helpers — ONE module for every runtime (browser,
// Node/SSG, edge). A consumer imports `absoluteURL` / `baseURL` / `pageURL`
// once and it works regardless of which condition resolved it, so there's no
// env.server/env.client split AND no dependence on client-reference condition
// routing (a `"use client"` import that resolves under `react-server` still
// works in the browser, because this same file handles both env sources).
//
// Priority per read:
//   1. `import.meta.env.<KEY>` (dot access) — shipped UNPARSED from vprs (the
//      self-referential `define` in vite.config shields it from Oxc), then
//      statically replaced by the CONSUMER's Vite in browser + transformed-SSR
//      builds. In bare Node (vprs is external there) `import.meta.env` is
//      undefined, so the access throws — caught below.
//   2. `process.env.VITE_<KEY>` — the Node/SSG/edge fallback (vprs's config sets
//      these), also what vprs's own build-time code resolves against.
type MetaEnv = {
  base?: string;
  origin?: string;
  dev?: boolean | string;
  mode?: string;
};

const fromImportMeta = (): MetaEnv => {
  try {
    // Each is a dot access so the consumer's Vite replaces it; reading them in
    // one try means a bare-Node `undefined.BASE_URL` throw skips the whole block.
    return {
      base: import.meta.env.BASE_URL,
      origin: import.meta.env.PUBLIC_ORIGIN,
      dev: import.meta.env.DEV,
      mode: import.meta.env.MODE,
    };
  } catch {
    return {};
  }
};

const fromProcess = (key: "VITE_BASE_URL" | "VITE_PUBLIC_ORIGIN"): string | undefined =>
  typeof process !== "undefined" && process.env ? process.env[key] : undefined;

const base = (): string =>
  fromImportMeta().base ?? fromProcess("VITE_BASE_URL") ?? "/";
const origin = (): string =>
  fromImportMeta().origin ?? fromProcess("VITE_PUBLIC_ORIGIN") ?? "";

export const absoluteURL = (path: string) =>
  createAbsoluteURL(base(), origin())(path);

export const baseURL = (path: string) => createBaseURL(base())(path);

export const pageURL = (path: string) => {
  const meta = fromImportMeta();
  const isDev =
    typeof meta.dev === "boolean"
      ? meta.dev
      : meta.mode === "development" ||
        (typeof process !== "undefined" &&
          process.env?.NODE_ENV === "development");
  return createPageURL(base(), origin(), isDev)(path);
};
