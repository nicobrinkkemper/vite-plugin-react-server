import type { ESBuildOptions, UserConfig } from "vite";

// Minimal shape of Vite 8's `oxc` config. Imported from "vite" it would be
// `OxcOptions`, but that type doesn't exist in Vite 6/7, so model it locally to
// keep the source building on every supported Vite.
type OxcLike = {
  jsx?: ({ development?: boolean } & Record<string, unknown>) | string;
} & Record<string, unknown>;

export type JsxOverrideInput = {
  /** Major version of the installed Vite. */
  viteMajor: number;
  command: "build" | "serve";
  /** The user's `esbuild` config (Vite 6/7). */
  esbuild: ESBuildOptions | false | undefined;
  /** The user's `oxc` config (Vite 8). */
  oxc: OxcLike | false | undefined;
};

/**
 * The JSX settings vprs adds to the user's config, as a partial config to
 * spread over it. Vite 8 (Rolldown/Oxc) deprecates the `esbuild` config in
 * favour of `oxc` and warns when a plugin sets it, so each setting targets
 * whichever key the installed Vite understands.
 *
 * 1. The automatic JSX runtime by default (Vite 6/7 only).
 *
 *    esbuild compiles JSX to `React.createElement(...)` unless told
 *    otherwise, so a component that does not import React throws
 *    `ReferenceError: React is not defined`. Oxc already defaults to the
 *    automatic runtime (`react/jsx-runtime`, no import needed), so Vite 8 is
 *    left alone and Vite 6/7 get the same default here. A user who chose a
 *    JSX mode themselves (`esbuild.jsx`, or a classic-mode factory) keeps it.
 *
 * 2. The PRODUCTION JSX transform for every build environment.
 *
 *    Under a dev-mode build (`NODE_ENV=development … vite build --mode
 *    development`) esbuild's automatic-runtime JSX transform emits the dev
 *    call shape `jsxDEV(type, props, key, isStaticChildren, source, self)`.
 *    esbuild renders the trailing `self` argument as a bare `module`
 *    reference when it can't prove the file is ESM at per-file transform
 *    time. The vprs server bundle is pure ESM (`dist/server/*.js`), so at
 *    SSG-prerender time that `module` identifier is undefined and the very
 *    first server component to render (e.g. the built-in `Html` component)
 *    throws `ReferenceError: module is not defined`.
 *
 *    The server bundle never consumes jsxDEV's client-warning
 *    `source`/`self` info, so dropping to the production transform
 *    (`jsx`/`jsxs`, no `self` arg) is a pure win for builds:
 *      - It only changes the JSX *call shape*, NOT which React build is
 *        bundled — `NODE_ENV=development` still resolves the development
 *        (non-minified) React, so dev builds keep surfacing the errors
 *        production minifies away.
 *      - Production builds already use the production JSX transform
 *        (esbuild only emits jsxDEV in dev), so this is a no-op there.
 *      - Scoped to `command === "build"`, so the dev SERVER / client
 *        Fast Refresh path (`command === "serve"`) is untouched.
 *    The knob maps 1:1 across toolchains (esbuild.jsxDev ->
 *    oxc.jsx.development).
 */
export function resolveJsxOverride({
  viteMajor,
  command,
  esbuild,
  oxc,
}: JsxOverrideInput): Partial<UserConfig> {
  if (esbuild === false || oxc === false) return {};
  const isBuild = command === "build";

  if (viteMajor >= 8) {
    if (!isBuild) return {};
    const base: OxcLike = typeof oxc === "object" && oxc ? oxc : {};
    const jsx = typeof base.jsx === "object" && base.jsx ? base.jsx : {};
    // `oxc` only exists on Vite 8's UserConfig; assert across versions.
    return {
      oxc: { ...base, jsx: { ...jsx, development: false } },
    } as Partial<UserConfig>;
  }

  const base: ESBuildOptions = typeof esbuild === "object" ? esbuild : {};
  const userChoseJsxMode =
    base.jsx !== undefined ||
    base.jsxFactory !== undefined ||
    base.jsxFragment !== undefined;
  if (userChoseJsxMode && !isBuild) return {};
  return {
    esbuild: {
      ...base,
      ...(userChoseJsxMode ? {} : { jsx: "automatic" as const }),
      ...(isBuild ? { jsxDev: false } : {}),
    },
  };
}
