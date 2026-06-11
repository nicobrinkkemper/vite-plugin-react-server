import { createRequire } from "node:module";

/**
 * Lazy, React-paired CJS loading for the vendored react-server-dom-esm
 * transport.
 *
 * Two failure modes this prevents (both: NODE_ENV flipping mid-process):
 *
 * 1. The vendored CJS wrappers branch on process.env.NODE_ENV at require
 *    time. Requiring them eagerly at plugin-import time locks the dev/prod
 *    renderer to NODE_ENV-at-import, which can disagree with the variant of
 *    the React elements created later — `vite build` (and any harness
 *    driving it) sets NODE_ENV AFTER the plugin is imported. A development
 *    renderer fed production elements dies inside React with "Cannot set
 *    properties of undefined (setting 'validated')".
 *
 * 2. Even loaded lazily, sampling NODE_ENV independently can disagree with
 *    the React copy the process is ALREADY locked into: any top-level
 *    `import React from "react"` in the plugin graph (e.g. the default
 *    components) caches react's dev/prod pick at plugin-import time, and
 *    every later require returns that cached copy. A production renderer
 *    driving a cached DEVELOPMENT react crashes with "dispatcher.getOwner
 *    is not a function".
 *
 * So the loader (a) defers the require to FIRST USE, and (b) resolves the
 * dev/prod variant from the React copy already in the require cache when
 * there is one, falling back to NODE_ENV only when react hasn't loaded yet.
 */

export type RendererMode = "development" | "production";

const nodeRequire = createRequire(import.meta.url);

export const nodeEnvMode = (): RendererMode =>
  process.env["NODE_ENV"] === "production" ? "production" : "development";

/**
 * The dev/prod variant of the React copy this process is locked into
 * (Node's CJS cache is per-process: the first require wins for everyone),
 * or null when react hasn't been required yet.
 */
export function reactModeFromCache(): RendererMode | null {
  const cache = nodeRequire.cache ?? {};
  for (const [key, entry] of Object.entries(cache)) {
    // Node's ESM-CJS bridge (cjs-module-lexer) statically analyzes BOTH
    // branches of react's NODE_ENV wrapper and leaves UNEVALUATED entries in
    // the cache (loaded=false, empty exports). Only a fully evaluated module
    // tells us which variant the process actually runs.
    if (!entry?.loaded) continue;
    if (/[\\/]react[\\/]cjs[\\/]react\.[^\\/]*development\.js$/.test(key)) {
      return "development";
    }
    if (/[\\/]react[\\/]cjs[\\/]react\.[^\\/]*production\.js$/.test(key)) {
      return "production";
    }
  }
  return null;
}

/** Variant the vendored transport must pair with: cached react, else NODE_ENV. */
export const reactPairedMode = (): RendererMode =>
  reactModeFromCache() ?? nodeEnvMode();

/**
 * Run `fn` with NODE_ENV swapped to `mode` for its (synchronous) duration.
 * The React-family CJS entries pick their variant from NODE_ENV at require
 * time, and the variant files themselves are NODE_ENV-gated (the development
 * build is wrapped in `"production" !== NODE_ENV &&` and evaluates to EMPTY
 * exports under production) — so loading a paired variant when NODE_ENV
 * disagrees requires the swap.
 */
export function withNodeEnv<T>(mode: RendererMode, fn: () => T): T {
  const previous = process.env["NODE_ENV"];
  const needSwap = (previous === "production") !== (mode === "production");
  if (needSwap) process.env["NODE_ENV"] = mode;
  try {
    return fn();
  } finally {
    if (needSwap) {
      if (previous === undefined) {
        delete (process.env as Record<string, string | undefined>)["NODE_ENV"];
      } else {
        process.env["NODE_ENV"] = previous;
      }
    }
  }
}

let lockedFamilyMode: RendererMode | null = null;

/**
 * Pin the consumer React family (react, react/jsx-runtime,
 * react/jsx-dev-runtime) into the CJS cache as ONE consistent dev/prod
 * variant — the variant React is already locked to if it has loaded, else
 * the current NODE_ENV.
 *
 * Call before loading user page modules for an in-process render: a page
 * bundle's `react/jsx-runtime` import evaluates whenever the module loads,
 * and without this pre-warm it can resolve a DIFFERENT variant than the
 * already-cached react (NODE_ENV flipped in between), producing elements
 * the paired renderer can't process.
 */
export function lockReactFamily(): RendererMode {
  if (lockedFamilyMode !== null) return lockedFamilyMode;
  const mode = reactPairedMode();
  const projectRoot =
    process.env["npm_config_local_prefix"] || process.cwd();
  const projectRequire = createRequire(
    `${projectRoot.replace(/\/$/, "")}/package.json`
  );
  withNodeEnv(mode, () => {
    try {
      projectRequire("react");
      projectRequire("react/jsx-runtime");
    } catch {
      // no consumer react resolvable from here — nothing to pin
    }
    try {
      projectRequire("react/jsx-dev-runtime");
    } catch {
      // optional entry; fine if absent
    }
  });
  lockedFamilyMode = mode;
  return mode;
}

export interface LazyVendorModule<T extends object> {
  /** The module, loaded on first property access. */
  proxy: T;
  /** dev/prod variant the module resolved to, or null before first use. */
  getLoadedMode: () => RendererMode | null;
}

export function createLazyVendorModule<T extends object>(
  load: (mode: RendererMode) => T,
  resolveMode: () => RendererMode = nodeEnvMode
): LazyVendorModule<T> {
  let loaded: T | null = null;
  let loadedMode: RendererMode | null = null;

  const ensure = (): T => {
    if (loaded === null) {
      const mode = resolveMode();
      loaded = withNodeEnv(mode, () => load(mode));
      loadedMode = mode;
    }
    return loaded;
  };

  const proxy = new Proxy({} as T, {
    get: (_target, prop) => (ensure() as any)[prop],
    has: (_target, prop) => prop in (ensure() as any),
    ownKeys: () => Reflect.ownKeys(ensure() as any),
    getOwnPropertyDescriptor: (_target, prop) => {
      const desc = Reflect.getOwnPropertyDescriptor(ensure() as any, prop);
      if (desc) return { ...desc, configurable: true };
      return undefined;
    },
  });

  return { proxy, getLoadedMode: () => loadedMode };
}
