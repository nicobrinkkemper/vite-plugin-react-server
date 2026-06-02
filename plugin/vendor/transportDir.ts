import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * Locate the vendored `react-server-dom-esm` transport.
 *
 * As of 2.0 the transport is no longer vendored into this repo — it ships
 * inside the `react-server-loader` dependency, under its `vendor/` dir. We
 * resolve it through the package so it works whether rsl is a real install,
 * hoisted, or symlinked (dev). `react-server-loader` exposes `./package.json`
 * in its exports map, so this resolves under any resolution condition.
 */
const require = createRequire(import.meta.url);
const rslRoot = dirname(require.resolve("react-server-loader/package.json"));

/** Absolute path to the `react-server-loader` package root (for Vite fs.allow). */
export const transportRoot = rslRoot;

/** Absolute path to the vendored `react-server-dom-esm` package dir. */
export const transportPkgDir = join(rslRoot, "vendor", "react-server-dom-esm");
