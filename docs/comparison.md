# How vprs compares

An honest look at where `vite-plugin-react-server` (vprs) sits among the
Vite-based ways to run React Server Components. The short version: vprs is a
**plugin, not a framework**, it targets **stable React 19.2** with an
**ESM-native** transport, and its build emits **portable ESM** you can host
anywhere. If you want a framework to make the decisions for you, Waku or Vike
are likely the better fit; if you want the official low-level building block,
that is `@vitejs/plugin-rsc`. vprs is the niche in between: a low-level plugin,
like the official one, but ESM-first and portable-output by design.

## At a glance

| | **vprs** | **@vitejs/plugin-rsc** | **Waku** | **Vike** (+ vike-react-rsc) |
|---|---|---|---|---|
| Kind | Vite plugin | Vite plugin (official) | Framework | Framework (+ RSC extension) |
| Imposes routing / app structure | No | No | Yes (file-based pages router) | Yes (file-based) |
| React target | Stable 19.2+ | Stable, canary, or experimental (your choice) | React 19 | React 19 |
| RSC transport | `react-server-dom-esm` (ESM), vendored | `react-server-dom-webpack`, vendored (BYO to pin a version) | managed by the framework | managed by the extension |
| Build output | `static/` + `client/` + `server/` portable ESM | app bundle via multi-environment build | framework-managed | framework-managed |
| Host anywhere (static / Express / Hono) | Yes, you wire the server | Yes | Via the framework's server | Via vike-server |
| Node `--conditions react-server` | Optional (both modes work by design) | Used internally | Managed | Managed |
| Maturity (mid-2026) | 2.x | 0.5.x, official and actively developed | 1.0 beta | extension is early-stage |

Versions move fast; check each project for current numbers. The rows above
describe positioning, not a scorecard, and every tool here is a legitimate
choice for the job it is built for.

## When each one fits

- **vprs** — you want RSC as a *plugin* on plain Vite, on stable React, with a
  build that produces portable ESM (a static site plus `client/` and `server/`
  modules) you drop into your own static host or Node server. You are happy to
  own routing and the server wiring. You specifically want the ESM transport
  rather than the webpack one.
- **`@vitejs/plugin-rsc`** — the official, framework-agnostic Vite RSC plugin
  and the foundation several tools build on. Reach for it when you want the
  canonical low-level plugin, the webpack-flavored transport, or the freedom to
  pin React (including canary/experimental) by installing
  `react-server-dom-webpack` yourself.
- **Waku** — you want a minimal *framework*: a file-based pages router and the
  conventions to go with it, batteries included, without assembling the pieces.
- **Vike (+ vike-react-rsc)** — you are already on Vike (or want its flexible
  framework model) and want to adopt RSC progressively, component by component.

## What vprs deliberately does NOT do

Being a plugin rather than a framework is the whole point, so a lot is out of
scope on purpose:

- **No router.** No file-based routing, no nested layouts, no data-loader
  convention. You provide a `Page` (and optional `props`) and list the pages to
  prerender; richer routing is yours to build (see
  [Examples](./examples.md#custom-routing)).
- **No framework conveniences.** No auth, i18n, head/meta management, image
  optimization, or plugin ecosystem. vprs transforms RSC boundaries, runs the
  workers, and emits ESM; the rest of the app is yours.
- **No webpack/RSC-bundler transport.** vprs is ESM-only by design. If your
  pipeline needs `react-server-dom-webpack`, use `@vitejs/plugin-rsc`.
- **No deployment/hosting layer.** The build emits ESM and a static directory;
  wiring them into a host (static CDN, Express, Hono, serverless) is up to you.
  See [Build Output](./build-output.md).
- **No managed React version.** vprs targets stable React 19.2+ and vendors the
  matching ESM transport via `react-server-loader`; it does not broker arbitrary
  React channels the way `@vitejs/plugin-rsc` can.

It is also younger and has a smaller community than the official plugin or the
established frameworks. If those matter more to you than the ESM-first,
plugin-only model, prefer one of the alternatives above.
