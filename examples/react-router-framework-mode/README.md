# Spike: React Router framework mode on vprs

**Question:** can [React Router v7](https://reactrouter.com) **framework mode**
(its RSC preview) run with vprs as the RSC engine underneath it?

**Short answer: no — not as a "vprs underneath React Router" integration.** React
Router framework mode's RSC support is built specifically on
[`@vitejs/plugin-rsc`](https://www.npmjs.com/package/@vitejs/plugin-rsc), and
vprs is an *alternative to* that plugin, not a substrate it can sit on. They are
siblings, not layers. This is an architecture-level mismatch, not a config knob.

This directory is intentionally a write-up, not a runnable example. Here's why.

## What React Router framework mode requires

React Router's RSC framework mode (preview, React Router `7.9.x`) is configured
like this ([official docs](https://reactrouter.com/how-to/react-server-components)):

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { unstable_reactRouterRSC as reactRouterRSC } from "@react-router/dev/vite";
import rsc from "@vitejs/plugin-rsc";

export default defineConfig({
  plugins: [reactRouterRSC(), rsc()],
});
```

Two load-bearing facts:

1. **`@vitejs/plugin-rsc` is a hard peer dependency of `unstable_reactRouterRSC`.**
   The React Router docs state the framework-mode plugin "has a peer dependency
   on the experimental `@vitejs/plugin-rsc` plugin." It is not optional or
   swappable in the public API.
2. **React Router consumes `@vitejs/plugin-rsc`'s runtime, not a generic RSC
   contract.** Its loaders/actions/server-component rendering go through
   `@vitejs/plugin-rsc`'s runtime entrypoints (e.g. `renderToReadableStream` /
   `createFromReadableStream`, the `@vitejs/plugin-rsc/rsc` + `/ssr` exports) and
   that plugin's environment + client-reference manifest. React Router is coupled
   to *that plugin's* API surface and its `react-server-dom-webpack`-family
   transport.

## Why vprs can't be the engine under it

vprs is **the ESM-transport alternative to `@vitejs/plugin-rsc`**, not something
that plugs in beneath it:

| | `@vitejs/plugin-rsc` (what RR uses) | vprs |
|---|---|---|
| Transport | `react-server-dom-webpack` family | `react-server-dom-esm` (via `react-server-loader`) |
| Runtime API | `@vitejs/plugin-rsc/rsc`, `/ssr` (`renderToReadableStream`, `createFromReadableStream`) | vprs's own `./server` / `./client` / `./stream` API |
| Client-reference manifest | plugin-rsc's manifest shape | vprs's own reference gate / module IDs |
| Output | app bundle via multi-environment build | portable `static/` + `client/` + `server/` ESM |

`unstable_reactRouterRSC` imports the first column. vprs implements the second.
There is no adapter seam where vprs satisfies the plugin-rsc runtime contract, so:

- **You can't drop vprs in for `rsc()`** — React Router would still try to import
  `@vitejs/plugin-rsc`'s runtime, which vprs does not export.
- **You can't run both plugins together** — `vitePluginReactServer()` and `rsc()`
  would each claim the `react-server` environment, each transform
  `"use client"` / `"use server"`, and each vendor a (different) transport.
  Two RSC pipelines fighting over the same module graph is a conflict, not a
  composition.

## What it would actually take

Making vprs the engine under React Router framework mode would mean vprs
implementing **`@vitejs/plugin-rsc`'s plugin + runtime API as a drop-in
replacement** — the `rsc()` plugin contract, the `@vitejs/plugin-rsc/rsc`
runtime exports, and its manifest/environment shape. That is a large comp
layer, and it largely erases vprs's reason to exist: the ESM transport and
portable-ESM output would be hidden behind a webpack-transport-shaped API.

## The composition that *does* work

React Router's **declarative / data (library) mode** composes with vprs fine,
because there you use React Router as a *library*, not as the build's RSC owner:

- vprs renders and prerenders the RSC tree and emits the portable ESM.
- React Router runs inside a `"use client"` boundary and drives **client-side
  navigation** between routes.

That is a genuine "third-party router running on vprs" demo and the recommended
shape if we want a runnable example. It does **not** use React Router framework
mode — and that's the point of this finding: framework mode brings its own RSC
build, so the integration story is "React Router the library on vprs," not
"React Router the framework on vprs."

## Versions checked

- `react-router` / `@react-router/dev` — `7.9.x` RSC framework-mode preview
- `@vitejs/plugin-rsc` — `0.5.27`
- vprs — `2.3.x`
- Checked 2026-06-17.

This is a preview/`unstable_` API on the React Router side and may change; the
coupling to `@vitejs/plugin-rsc`, however, is the design, not an accident
([React Router and RSC: the path forward](https://remix.run/blog/react-router-and-react-server-components)).
