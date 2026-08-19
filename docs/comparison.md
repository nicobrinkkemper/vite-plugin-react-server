# How vprs compares

An honest look at where `vite-plugin-react-server` (vprs) sits among the
Vite-based ways to run React Server Components. The short version: vprs is a
**low-level plugin rather than a framework**, it runs on **stable React 19.2**
(or experimental), and its build emits **portable ESM** you can host anywhere.
If you want a framework to make the decisions for you, Waku or Vike are likely
the better fit; if you want the official low-level building block, that is
`@vitejs/plugin-rsc`. vprs is the niche in between: a small RSC dev/build setup,
like the official plugin in spirit, but with portable output you host yourself.
Since v3 it also ships an opt-in [file-based router](./routing.md) — dynamic
params, nested layouts, per-segment loaders, client-side navigation — without
becoming a framework: the router is one config field, not an app structure you
inherit. What mostly defines vprs is still what it withholds: it takes no
opinion on how your React app is built, so the optimizations that fit your app
are yours to add rather than a general-purpose set baked in for you (more on
that under
[What you get for wiring it yourself](#what-you-get-for-wiring-it-yourself)).
The RSC transport underneath is supplied by `react-server-loader`; treat it as
an implementation detail, not a knob you tune.

## At a glance

| | **vprs** | **@vitejs/plugin-rsc** | **Waku** | **Vike** (+ vike-react-rsc) |
|---|---|---|---|---|
| Kind | Vite plugin | Vite plugin (official) | Framework | Framework (+ RSC extension) |
| Imposes routing / app structure | No — file-based router is opt-in (since v3) | No | Yes (file-based pages router) | Yes (file-based) |
| React target | Stable 19.2+ (default) or experimental | Stable, canary, or experimental (your choice) | React 19 | React 19 |
| RSC transport | `react-server-dom-esm` by default, via `react-server-loader`; `transport: "webpack"` switches the whole deploy (dev server, snapshots, edge pair) to the vendored webpack flavor | `react-server-dom-webpack`, vendored (BYO to pin a version) | managed by the framework | managed by the extension |
| Build output | `static/` + `client/` + `server/` portable ESM | app bundle via multi-environment build | framework-managed | framework-managed |
| Host anywhere (static / Express / Hono) | Yes, you wire the server | Yes | Via the framework's server | Via vike-server |
| Node `--conditions react-server` | Declared via the required `runner`: `"main"` requires it, `"isolated"` rejects it (see [below](#the-react-server-condition-follows-the-runner)) | Used internally | Managed | Managed |
| Maturity (mid-2026) | 3.x | 0.5.x, official and actively developed | 1.0 beta | extension is early-stage |

Versions move fast; check each project for current numbers. One caveat on that
Maturity row: vprs's `3.x` is not a maturity claim over the official plugin's
`0.5.x`. vprs is the younger project with the smaller community; the two version
lines simply count different things. The rows above describe positioning, not a
scorecard, and every tool here is a legitimate choice for the job it is built
for.

## When each one fits

- **vprs** — you want RSC as a *plugin* on plain Vite, on stable React, with a
  build that produces portable ESM (a static site plus `client/` and `server/`
  modules) you drop into your own static host or Node server. Routing is
  covered if you want it — the [file-based router](./routing.md) (v3+) gives you
  dynamic params, nested layouts and loaders from one config field — or you map
  URLs to files yourself. Either way you own the server wiring, and you want a
  small RSC dev/build setup rather than a framework.
- **`@vitejs/plugin-rsc`** — the official, framework-agnostic Vite RSC plugin
  and the foundation several tools build on. Reach for it when you want the
  canonical low-level plugin, the webpack-flavored transport, or the freedom to
  pin React (including canary/experimental) by installing
  `react-server-dom-webpack` yourself.
- **Waku** — you want a minimal *framework*: not just a file-based pages router
  but the whole set of conventions to go with it, batteries included, without
  assembling the pieces.
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
`react` / `react-dom` / `react-server-loader` at the exact experimental
snapshot vprs's peer range names (see
[React Compatibility](./react-type-compatibility.md)). The vendored ESM
transport ships both a stable and an experimental train for this reason.

Running experimental buys you the newest RSC features ahead of the stable
channel. A concrete example today: stable React 19.2.x emits a cosmetic
`as="stylesheet"` preload warning that the experimental channel has already
fixed. Our own [mmcelebration.com](https://www.mmcelebration.com) site runs vprs
on the experimental train. See
[React Compatibility](./react-type-compatibility.md) for the support matrix and
how to pin the versions.

## What you get for wiring it yourself

The flip side of the "you provide the server" model is the actual reason to
reach for vprs: because vprs has no opinion on how your app renders, you can fit
the rendering strategy to each route instead of inheriting one general-purpose
strategy from a framework.

Concretely, the build prerenders your pages to static HTML with each route's RSC
payload inlined into the page, so a static route hydrates in place on first
paint with no extra round-trip for its data. The file writer that produces this
output streams each route's HTML and `.rsc` payload straight to disk — no
buffering the site in memory — and refuses to silently ship a degraded page: an
HTML document that rendered without a root `<html>` element fails the build
(under the default panic policy) instead of deploying broken. A route whose
content depends on per-request data can render its HTML per request instead.
You decide per route; nothing forces a single model across the whole app.

This is not a claim that vprs is faster out of the box. A framework that bakes a
strategy in is doing real work you would otherwise do yourself, and for many
apps that is the better deal. The honest trade is that a framework picks the
optimization for you and vprs declines to, leaving both the ceiling and the
assembly in your hands.

## The `react-server` condition follows the runner

vprs supports both topologies: the main thread runs under
`--conditions react-server` and renders RSC directly, or a worker thread owns
the react-server half while the main thread stays plain. The required `runner`
option declares which one, and the declaration is validated at startup:
`runner: "main"` errors without the process flag, `runner: "isolated"` errors
with it. The output is identical either way.

The reasons to declare `"main"` are developer experience rather than
correctness: stack traces for your server components stay on the main thread
where they are easier to read, and any plain Node script you run in that
process gains React and RSC support, including your `vite.config`.

The condition is also a footgun. It is process-global, so it changes module
resolution for everything in that process, which is easy to forget you turned
on. That is exactly why the runner is declared rather than inferred: the
config names the topology, and a mismatch between the declaration and the
process is a startup error instead of a silent difference.

## Is the ESM transport safe in production?

A fair question, because `react-server-dom-esm` is published with a warning that
it is for internal testing, not production. That warning is about the transport
in isolation. On its own it resolves a client-supplied reference id by importing
the path the id encodes, guarded only by a prefix check. It has no manifest of
which references are real, which is the trust boundary the webpack-family
transports get from their bundler plugin.

The other transports get that boundary from their bundler plugin. vprs supplies
it through `handleServerAction`, which seals automatically: in production it reads
the build's server manifest and resolves actions through a sealed allowlist
(lookup-or-throw, importer bound to the manifest's real file), so an id the build
never emitted is rejected — no extra wiring on your part. In development it falls
back to the open dev resolver, which is not a trust boundary. A static build has
no server runtime, so it has no callable surface at all. See
[Server Actions → Security](./server-actions.md#security) for the details and the
responsibilities that remain yours.

## What vprs deliberately does NOT do

Being a plugin rather than a framework is the whole point, so a lot is out of
scope on purpose:

- **No imposed routing.** Since v3 vprs *does* ship a file-based router —
  dynamic params, nested layouts, per-segment loaders, prerendering, client-side
  `Link` navigation (see [Routing](./routing.md)) — but it is one opt-in config
  field, not an app structure. Skip it and you provide a `Page` (and optional
  `props`) yourself, mapping URLs to files however you like (see
  [Examples](./examples.md#routing)).
- **No framework conveniences.** No auth, i18n, head/meta management, image
  optimization, or plugin ecosystem. vprs transforms RSC boundaries, runs the
  workers, and emits ESM; the rest of the app is yours.
- **No pluggable transport.** vprs renders through the transports
  `react-server-loader` vendors: the ESM transport (`react-server-dom-esm`)
  everywhere, plus a vendored webpack transport that only the
  [edge bake](./edge.md) can select (`build.edge.transport: "webpack"`). If
  your pipeline needs to bring its own transport build, use
  `@vitejs/plugin-rsc`.
- **No deployment/hosting layer.** The build emits ESM and a static directory;
  wiring them into a host (static CDN, Express, Hono, serverless) is up to you.
  The static output runs anywhere (including the edge). Dynamic SSR has two
  shapes: the default worker-based build (Node, `worker_threads`) and the
  [single-isolate edge bundle](./edge.md), which needs no workers and no
  `--conditions` flag. How far that bundle reaches is set by its transport
  (`build.edge.transport`): the default `"esm"` render imports built modules
  off disk, so it targets Node-compatible hosts; `"webpack"` bakes a closed
  module map plus a consumer bundle with no `node:` imports, which is what
  filesystem-less runtimes (Cloudflare Workers, Deno Deploy) require. See
  [Build Output → Where it runs](./build-output.md#where-it-runs-static-anywhere-dynamic-on-node).
- **Two React trains, not any React build.** vprs pins React through
  `react-server-loader`, which ships a stable train and an experimental train;
  you pick one (see "React" above). `@vitejs/plugin-rsc` instead lets you bring
  any `react-server-dom-webpack` build you install, canary included. That is
  genuinely more flexible. vprs trades it for a version-locked transport you do
  not have to assemble or keep in sync yourself.

It is also younger and has a smaller community than the official plugin or the
established frameworks. If those matter more to you than the plugin-only,
portable-output model, prefer one of the alternatives above.
