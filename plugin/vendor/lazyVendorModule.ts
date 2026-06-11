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
 * So the loader (a) defers the require to FIRST USE, (b) resolves the
 * dev/prod variant from the React copy already in the require cache when
 * there is one (falling back to NODE_ENV), and (c) pins the rest of the
 * react family (jsx-runtime) to the same variant before anything renders.
 */

export type RendererMode = "development" | "production";

const nodeRequire = createRequire(import.meta.url);

export const nodeEnvMode = (): RendererMode =>
  process.env["NODE_ENV"] === "production" ? "production" : "development";

let cachedReactMode: RendererMode | null = null;

/**
 * The dev/prod variant of the React copy this process is locked into
 * (Node's CJS cache is per-process: the first require wins for everyone),
 * or null when react hasn't been required yet. Memoized once non-null —
 * an evaluated CJS module never unloads, so the answer can't change.
 *
 * Caveat (rare): with two physical react copies in the process the scan
 * reports whichever evaluated first; the lockReactFamily warning gives
 * visibility when the result disagrees with the build's NODE_ENV.
 */
export function reactModeFromCache(): RendererMode | null {
  if (cachedReactMode !== null) return cachedReactMode;
  const cache = nodeRequire.cache ?? {};
  for (const key in cache) {
    // Node's ESM-CJS bridge (cjs-module-lexer) statically analyzes BOTH
    // branches of react's NODE_ENV wrapper and leaves UNEVALUATED entries in
    // the cache (loaded=false, empty exports). Only a fully evaluated module
    // tells us which variant the process actually runs.
    if (!cache[key]?.loaded) continue;
    if (/[\\/]react[\\/]cjs[\\/]react\.[^\\/]*development\.js$/.test(key)) {
      return (cachedReactMode = "development");
    }
    if (/[\\/]react[\\/]cjs[\\/]react\.[^\\/]*production\.js$/.test(key)) {
      return (cachedReactMode = "production");
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
let warnedModeMismatch = false;

/**
 * Pin the consumer React family (react, react/jsx-runtime,
 * react/jsx-dev-runtime) into the CJS cache as ONE consistent dev/prod
 * variant — the variant React is already locked to if it has loaded, else
 * the current NODE_ENV.
 *
 * Runs automatically on the first load of any lazy vendor module (so every
 * render path — SSG, dev server, workers — is covered without per-call-site
 * wiring) and explicitly before in-process page loads in renderPagesBatched.
 *
 * A page bundle's `react/jsx-runtime` import evaluates whenever the module
 * loads; without this pre-warm it can resolve a DIFFERENT variant than the
 * already-cached react (NODE_ENV flipped in between), producing elements
 * the paired renderer can't process.
 */
export function lockReactFamily(): RendererMode {
  if (lockedFamilyMode !== null) return lockedFamilyMode;
  const mode = reactPairedMode();

  // The locked variant can legitimately differ from the build's NODE_ENV:
  // programmatic builds (createBuilder/build() from a script that imports
  // the plugin first) and harnesses that mutate NODE_ENV mid-process cache
  // react before NODE_ENV settles. The vite CLI itself sets NODE_ENV before
  // evaluating the config, so it never hits this. Pairing keeps such builds
  // working instead of crashing, but the output is rendered with the
  // development React — say so loudly, once.
  if (mode !== nodeEnvMode() && !warnedModeMismatch) {
    warnedModeMismatch = true;
    console.warn(
      `[vite-plugin-react-server] React family locked to ${mode.toUpperCase()} ` +
        `but NODE_ENV is ${process.env["NODE_ENV"] ?? "<unset>"}: react was ` +
        `loaded before NODE_ENV settled (typically at plugin import during ` +
        `config load). Rendering proceeds with the ${mode} React to stay ` +
        `consistent. To get ${nodeEnvMode()} output, pin NODE_ENV before ` +
        `importing vite-plugin-react-server (e.g. NODE_ENV=${nodeEnvMode()} ` +
        `vite build).`
    );
  }

  // Resolve the consumer's react: prefer the consumer project, fall back to
  // the plugin's own resolution (monorepos where cwd isn't the app root).
  const bases = [process.env["npm_config_local_prefix"], process.cwd()].filter(
    (b): b is string => typeof b === "string" && b.length > 0
  );
  let pinned = false;
  withNodeEnv(mode, () => {
    const requires = [
      ...bases.map((b) =>
        createRequire(`${b.replace(/\/$/, "")}/package.json`)
      ),
      nodeRequire,
    ];
    for (const req of requires) {
      try {
        req("react");
        req("react/jsx-runtime");
        pinned = true;
      } catch {
        continue; // not resolvable from this base — try the next
      }
      try {
        req("react/jsx-dev-runtime");
      } catch {
        // optional entry; fine if absent
      }
      break;
    }
  });

  // Only memoize when something is actually pinned (or react was already
  // evaluated) — otherwise a later call, after react becomes resolvable,
  // should re-derive instead of trusting a lock that pinned nothing.
  if (pinned || reactModeFromCache() !== null) {
    lockedFamilyMode = mode;
  }
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
  resolveMode: () => RendererMode = nodeEnvMode,
  /**
   * Optional ground truth: inspect what the require ACTUALLY returned
   * (e.g. scan require.cache for the evaluated variant file). Guards
   * against the CJS cache already holding the other variant — `load()`
   * returns that cached module no matter what `resolveMode()` asked for,
   * and the parity diagnostics must reason from reality, not intent.
   */
  detectLoadedMode?: () => RendererMode | null
): LazyVendorModule<T> {
  let loaded: T | null = null;
  let loadedMode: RendererMode | null = null;

  const ensure = (): T => {
    if (loaded === null) {
      // Pin the react family before the transport loads — every render
      // path reaches a vendor proxy first, so the dev server and workers
      // are covered without per-call-site wiring.
      lockReactFamily();
      const mode = resolveMode();
      loaded = withNodeEnv(mode, () => load(mode));
      loadedMode = detectLoadedMode?.() ?? mode;
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

/**
 * Ground-truth detector for the vendored transport: which variant file is
 * ACTUALLY evaluated in the CJS cache for the given cjs basename prefix
 * (e.g. "react-server-dom-esm-server.node").
 */
export function vendoredTransportModeFromCache(
  cjsFilePrefix: string
): RendererMode | null {
  const cache = nodeRequire.cache ?? {};
  for (const key in cache) {
    if (!cache[key]?.loaded) continue;
    if (!key.includes(cjsFilePrefix)) continue;
    if (key.endsWith(".development.js")) return "development";
    if (key.endsWith(".production.js")) return "production";
  }
  return null;
}
