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

function resolveRslRoot(): string {
  try {
    return dirname(require.resolve("react-server-loader/package.json"));
  } catch (error) {
    // react-server-loader is a PEER dependency: npm>=7/pnpm>=8 install it
    // automatically, but yarn (and npm with legacy-peer-deps/omit=peer)
    // doesn't — without this, those users get a bare ERR_MODULE_NOT_FOUND
    // pointing nowhere useful.
    throw new Error(
      "[vite-plugin-react-server] react-server-loader is not installed. " +
        "It is a peer dependency that npm and pnpm install automatically, " +
        "but your package manager configuration does not. Install it next " +
        "to the plugin:\n\n" +
        "  yarn add react-server-loader        # stable React train\n" +
        "  yarn add react-server-loader@experimental   # experimental train\n\n" +
        "See docs/react-type-compatibility.md for the train pairing.",
      { cause: error }
    );
  }
}

const rslRoot = resolveRslRoot();

/** Absolute path to the `react-server-loader` package root (for Vite fs.allow). */
export const transportRoot = rslRoot;

/** Absolute path to the vendored `react-server-dom-esm` package dir. */
export const transportPkgDir = join(rslRoot, "vendor", "react-server-dom-esm");
