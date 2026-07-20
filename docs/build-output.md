# Build Output

Running `NODE_OPTIONS='--conditions react-server' vite build --app` produces three directories:

```
dist/
├── static/                    # Browser-ready output — deploy this
│   ├── index.html             # Pre-rendered HTML
│   ├── index.rsc              # RSC payload (for client navigation)
│   ├── about/
│   │   ├── index.html
│   │   └── index.rsc
│   ├── assets/                # Hashed JS/CSS bundles
│   └── .vite/manifest.json
├── client/                    # Client components built for Node
│   └── components/
│       └── Counter.client-CnBCzH8H.js
└── server/                    # Server components (react-server condition)
    ├── page/
    │   ├── page.js
    │   ├── props.js
    │   └── actions.server.js
    └── components/
        └── Counter.client-CnBCzH8H.js
```

`dist/client/` holds **only** client components and their dependencies — the
page server component lives in `dist/server/` alone (the renderer imports it
from there; `dist/client/` exists to resolve client references). With the
[file router](./routing.md), page modules mirror the routes directory instead:
`dist/server/routes/page.js`, `dist/server/routes/about/page.js`, and so on.

## Understanding the Three Builds

### A note on naming

React and Vite use the words "client" and "server" differently, and this matters for understanding the build output:

- **React** splits code by boundary: "client components" run on *both* client and server (they handle interactivity + SSR/SSG), "server components" run on the server only.
- **Vite** splits code by target: "client" means browser-ready bundles, "ssr" means Node.js-importable modules.

A React **client component** gets built **twice** — once as a browser bundle (Vite's "client" environment → `dist/static/`), and once as a Node-importable module (Vite's "ssr" environment → `dist/client/`). The Node version exists because during static HTML generation (or runtime SSR), the renderer must `import()` client components to produce HTML on the server.

Here's how Vite's build environments map to output directories:

| Vite environment | Output | What it contains | Why it exists |
|---|---|---|---|
| `client` | `dist/static/` | Hashed browser bundles, pre-rendered HTML, RSC payloads | Deploy to any static host. This is the final product. |
| `ssr` | `dist/client/` | Client components as ESM with bare specifier imports (`react`, `react-dom`) | The static renderer (and runtime SSR) needs to `import()` client components using Node module resolution. Browser bundles use hashed URLs — Node can't import those. |
| `server` | `dist/server/` | Server components, props, server actions (react-server condition) | Server-only code. Props functions, server actions with `registerServerReference`, and server components with client references replaced by `registerClientReference`. |

### `dist/static/` — deploy this

A self-contained static site. Every route in `build.pages` gets an `index.html` (full page) and `index.rsc` (RSC payload for client-side navigation). Deploy to GitHub Pages, Netlify, S3, or any static host.

This directory is generated *after* the other two builds complete, using `dist/server/` for server components and `dist/client/` for client components.

### `dist/client/` — client components for Node

ESM modules with bare specifier imports, built for Node.js. During static generation, the renderer imports these to resolve client component references into actual React elements for HTML rendering.

Without this build, the renderer would only have the server component tree with opaque client references — it couldn't produce complete HTML.

### `dist/server/` — server components

ESM modules built under the `react-server` condition. Server actions are transformed with `registerServerReference`. Client component imports are replaced with `registerClientReference` stubs that tell the RSC serializer "this is a client boundary, here's its module ID."

## How Static Generation Works

Understanding the build pipeline helps explain why all three directories are needed:

```
1. client build    → dist/static/  (browser bundles, index.html shell)
2. ssr build       → dist/client/  (client components for Node)
3. server build    → dist/server/  (server components, props)
   └─ writeBundle hook triggers static generation:
      a. import props from dist/server/props.js
      b. import Page from dist/server/page.js
      c. render RSC stream (server components → serialized React tree)
      d. import client components from dist/client/ to resolve references
      e. render HTML stream (RSC stream → full HTML document)
      f. write index.html + index.rsc to dist/static/
```

The dual-stream architecture (step c + e) is why the plugin produces both `.html` and `.rsc` files. With `build.inlineFlight: true`, each page's initial flight is additionally inlined into its `index.html` (`<script id="vprs-flight">`), so the first paint hydrates in place with no `/index.rsc` round-trip; the `.rsc` files then serve later client-side navigations — when a user clicks a link, the browser fetches the next route's `.rsc` instead of a full page reload. [`startClient`](./routing.md) is the client entry that boots all of this in the browser.

## Consistent Hashing

The same source file gets the same content hash across all three builds:

```
dist/client/components/Link.client-CnBCzH8H.js
dist/server/components/Link.client-CnBCzH8H.js
dist/static/components/Link.client-CnBCzH8H.js
```

This ensures module references are consistent between client and server. When the server component tree references a client component by module ID, that ID resolves correctly in both the browser (`dist/static/`) and Node (`dist/client/`).

## Using the ESM Modules in a Server

The build output is designed to be consumed by a Node.js HTTP server — but not
by hand-rolling one. `createRequestHandler` serves the static output with the
MIME types and traversal guard a file server has to get right, and dispatches
`"use server"` actions through the **sealed** production reference gate (an
allowlist baked from the build — never `import()` a module named by the
request):

```ts
// server.ts
import { createServer } from "node:http";
import {
  createRequestHandler,
  toNodeListener,
} from "vite-plugin-react-server/request-handler";
import * as bundle from "./dist/server-edge/render.js";

const app = createRequestHandler({
  staticDir: "dist/static",             // prerendered HTML, .rsc, assets
  action: bundle.handleRouteAction,     // sealed action gate, baked at build
});

createServer(toNodeListener(app)).listen(3000);
```

For the complete pattern — including per-request rendering of dynamic routes —
see the [bidoof-template](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)
demo's `start.tsx` and the [vprs-starter](https://github.com/nicobrinkkemper/vprs-starter)'s
`server/handler.mjs`.

## Where it runs: static anywhere, dynamic on Node

The three build outputs do not all target the same runtime, so it is worth being
precise about what deploys where.

**`dist/static/` runs anywhere.** It is just files — HTML, `.rsc` payloads,
hashed JS/CSS. Serve it from any static host, CDN, or edge network (GitHub
Pages, Netlify, S3/CloudFront, Cloudflare Pages). There is no runtime
requirement. For a fully static site this is the entire deployment.

**Dynamic SSR runs on Node, in one of two shapes.**

The *default* dynamic path (`createInlineFlightRenderer` and the html-worker
behind it) renders the react-dom HTML in a worker thread that runs in the
*opposite* React condition from your main thread (server components resolve
under `--conditions react-server`; react-dom renders the client half without
it). That worker is `node:worker_threads`, and the streams it speaks are
`node:stream` / `MessagePort`, so this shape needs a full Node process. The
cross-condition worker is also what lets the single-condition ESM transport
render both halves at all — see [Workers](./internals/workers.md) and
[How vprs compares](./comparison.md).

The *single-isolate* shape is the [edge bundle](./edge.md) (`build.edge`, on by
default): a baked `dist/server-edge/render.js` in which server React is inlined
at build time, so the render needs **no** `worker_threads` and **no**
`--conditions` flag — one process, one Web `fetch` handler, flash-free streaming
SSR included. Which runtimes it reaches is a property of the **transport**
(`build.edge.transport`): the default esm transport resolves client chunks off
disk, so it runs on Node-compatible hosts (Node servers, Bun, Vercel/Netlify
Node functions); the webpack transport additionally bakes a **consumer** bundle
(`dist/server-edge/consumer.js` — client React plus every client module behind
a closed registry), and that pair resolves no modules at request time, so it
also runs on filesystem-less runtimes (Cloudflare Workers, Deno Deploy) via
`vite-plugin-react-server/edge/web`. See [Edge / Single-Isolate](./edge.md).

A *static* build has no server runtime and therefore no callable surface, so
all of this only applies once you stand up a dynamic server.

**The pattern for an edge-network deployment is hybrid:** serve `dist/static/`
from the edge/CDN (instant, global, no runtime) and put dynamic SSR or server
actions on a function behind it — worker-based, single-isolate on Node, or the
webpack pair on a Worker, your pick. One constraint on mixing: prerendered
`.rsc`/inline-flight snapshots are esm-encoded, so a webpack-transport deploy
serves every route through the edge bundles rather than the page snapshots.

## Stream Types

### Headless RSC Stream (`index.rsc`)

Used for client-side page navigation. Contains serialized React components and CSS metadata. Smaller than full HTML — only updates what changed.

### Full HTML Stream (`index.html`)

Complete HTML document with `<html>`, `<head>`, `<body>`. Used for initial page load and static hosting.

Both streams include detailed stack traces in development mode.

## Build Modes

### Single-step (recommended)

```bash
NODE_OPTIONS='--conditions react-server' vite build --app
```

Builds all three environments in sequence automatically.

### Multi-step (for debugging)

```bash
vite build                                                    # static
vite build --ssr                                              # client
NODE_OPTIONS='--conditions react-server' vite build --ssr     # server
```

### Parallel Rendering

For sites with many pages:

```ts
build: {
  pages: ["/", "/about", ...hundredsOfPages],
  renderMode: "parallel",  // default
  batchSize: 8,            // pages per batch
}
```

Use `renderMode: "sequential"` for debugging or low-memory environments.

## `dist/server-edge/` (single-isolate edge bundle)

`build.edge` is **on by default** (pass `build.edge: false` to opt out), so the
build also emits:

```
dist/
└── server-edge/
    ├── render.js      # baked Flight producer, server React inlined
    └── consumer.js    # webpack transport only: flight → HTML half, client React inlined
```

This is **additive** — the three directories above are untouched. `render.js`
exports `renderRouteToDocument(url)` (the full flash-free document pair the
handlers drive), `renderRouteToFlight(url)` (the headless `.rsc` producer),
`handleRouteAction` (the baked sealed action gate), and its own baked wiring
(`bootstrapModules`, `clientManifest`, `flightTransport`, …) — so
`createEdgeRequestHandler(bundle)` needs nothing else on Node. With
`build.edge.transport: "webpack"`, `consumer.js` exports `renderFlightToHtml`
with every client module compiled in; passing it makes the pair
filesystem-free. See [Edge / Single-Isolate](./edge.md).

## Environment Variables

The plugin sets these automatically if not provided:

- `VITE_MODE` — build mode
- `VITE_DEV` / `VITE_PROD` — boolean flags
- `VITE_SSR` — true during SSR builds
- `VITE_PUBLIC_ORIGIN` — base URL for assets
- `VITE_BASE_URL` — application base URL. Mirrored from Vite's resolved `base`
  (or the `moduleBaseURL` option); an explicitly exported `VITE_BASE_URL`
  outranks both, as the deploy-time override.

Access them in server components via `process.env`.
