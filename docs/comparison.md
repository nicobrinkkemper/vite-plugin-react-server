# How vprs compares

An honest look at where `vite-plugin-react-server` (vprs) sits among the
Vite-based ways to run React Server Components. The short version: vprs is a
**low-level plugin rather than a framework**, it runs on **stable React 19.2**
(or experimental), and its build emits **portable ESM** you can host anywhere.
If you want a framework to make the decisions for you, Waku or Vike are likely
the better fit; if you want the official low-level building block, that is
`@vitejs/plugin-rsc`. vprs is the niche in between: a small RSC dev/build setup,
like the official plugin in spirit, but with portable output you own. (The RSC
transport underneath is supplied by `react-server-loader`, not a defining trait
of vprs — see the table below.)

## At a glance

| | **vprs** | **@vitejs/plugin-rsc** | **Waku** | **Vike** (+ vike-react-rsc) |
|---|---|---|---|---|
| Kind | Vite plugin | Vite plugin (official) | Framework | Framework (+ RSC extension) |
| Imposes routing / app structure | No | No | Yes (file-based pages router) | Yes (file-based) |
| React target | Stable 19.2+ (default) or experimental | Stable, canary, or experimental (your choice) | React 19 | React 19 |
| RSC transport | via `react-server-loader` (ESM today) | `react-server-dom-webpack`, vendored (BYO to pin a version) | managed by the framework | managed by the extension |
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
  own routing and the server wiring, and you want a small RSC dev/build setup
  rather than a framework.
- **`@vitejs/plugin-rsc`** — the official, framework-agnostic Vite RSC plugin
  and the foundation several tools build on. Reach for it when you want the
  canonical low-level plugin, the webpack-flavored transport, or the freedom to
  pin React (including canary/experimental) by installing
  `react-server-dom-webpack` yourself.
- **Waku** — you want a minimal *framework*: a file-based pages router and the
  conventions to go with it, batteries included, without assembling the pieces.
- **Vike (+ vike-react-rsc)** — you are already on Vike (or want its flexible
  framework model) and want to adopt RSC progressively, component by component.

### What about React Router framework mode?

It can't sit on vprs. React Router's RSC framework mode is built on
`@vitejs/plugin-rsc` (a hard peer dependency of `unstable_reactRouterRSC`) and
consumes that plugin's runtime and webpack-family transport. vprs supplies its
own RSC stack through `react-server-loader`, so there is no seam to swap it in,
and running both means two RSC pipelines over one module graph. What does
compose is React Router in **declarative / data (library) mode**: vprs owns RSC
and prerendering while React Router drives client-side navigation inside a
`"use client"` boundary.

## React: stable by default, experimental supported

vprs runs on **stable React 19.2+** out of the box — that is the default and
needs no special install. It **also supports experimental React**: install
`react@experimental` / `react-dom@experimental` and the matching
`react-server-loader@experimental` (which pins the exact experimental React it
was built against). The vendored ESM transport ships both a stable and an
experimental train for this reason.

Running experimental buys you the newest RSC features ahead of the stable
channel. A concrete example today: stable React 19.2.x emits a cosmetic
`as="stylesheet"` preload warning that the experimental channel has already
fixed. Our own [mmcelebration.com](https://www.mmcelebration.com) site runs vprs
on the experimental train. See
[React Compatibility](./react-type-compatibility.md) for the support matrix and
how to pin the versions.

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
- **No webpack/RSC-bundler transport (today).** The transport is
  `react-server-loader`'s concern — it is transport-agnostic by design but
  currently vendors only the ESM (`react-server-dom-esm`) train. If your pipeline
  needs the webpack transport, use `@vitejs/plugin-rsc`.
- **No deployment/hosting layer.** The build emits ESM and a static directory;
  wiring them into a host (static CDN, Express, Hono, serverless) is up to you.
  See [Build Output](./build-output.md).
- **No arbitrary React-channel brokering.** vprs binds to the vendored ESM
  transport (`react-server-loader`), which ships a stable train and an
  experimental train; you pick a train (see "React" above), not any React build
  via a swapped bundler transport the way `@vitejs/plugin-rsc` does with
  `react-server-dom-webpack`.

It is also younger and has a smaller community than the official plugin or the
established frameworks. If those matter more to you than the plugin-only,
portable-output model, prefer one of the alternatives above.
