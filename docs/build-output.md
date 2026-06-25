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
│   ├── page/
│   │   └── page.js
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

The dual-stream architecture (step c + e) is why the plugin produces both `.html` and `.rsc` files. The RSC payload is reused for client-side navigation — when a user clicks a link, the browser fetches the `.rsc` file instead of a full page reload.

## Consistent Hashing

The same source file gets the same content hash across all three builds:

```
dist/client/components/Link.client-CnBCzH8H.js
dist/server/components/Link.client-CnBCzH8H.js
dist/static/components/Link.client-CnBCzH8H.js
```

This ensures module references are consistent between client and server. When the server component tree references a client component by module ID, that ID resolves correctly in both the browser (`dist/static/`) and Node (`dist/client/`).

## Using the ESM Modules in a Server

The build output is designed to be consumed by any Node.js HTTP server. Here's an Express example:

```ts
// server.ts
import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// Serve static files (pre-rendered HTML + assets)
app.use(express.static(join(__dirname, "dist/static")));

// Handle RSC requests
app.get("*.rsc", (req, res) => {
  res.setHeader("Content-Type", "text/x-component");
  res.sendFile(join(__dirname, "dist/static", req.path));
});

// Handle server actions (POST requests to module paths)
app.post("/src/*", async (req, res) => {
  const modulePath = join(__dirname, "dist/server", req.path);
  const mod = await import(modulePath);
  const [, exportName] = req.url.split("#");
  const result = await mod[exportName](...req.body);
  // Stream RSC response back
  res.setHeader("Content-Type", "text/x-component");
  // ... stream the result
});

app.listen(3000);
```

For a real-world example, see the [bidoof-template](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official) demo.

## Where it runs: static anywhere, dynamic on Node

The three build outputs do not all target the same runtime, so it is worth being
precise about what deploys where.

**`dist/static/` runs anywhere.** It is just files — HTML, `.rsc` payloads,
hashed JS/CSS. Serve it from any static host, CDN, or edge network (GitHub
Pages, Netlify, S3/CloudFront, Cloudflare Pages). There is no runtime
requirement. For a fully static site this is the entire deployment.

**Dynamic SSR runs on Node, not on the edge.** The moment you render HTML per
request — the flash-free dynamic-route path (`createInlineFlightRenderer` and
the html-worker behind it) — you need Node. vprs renders the react-dom HTML in a
worker thread that runs in the *opposite* React condition from your main thread
(server components resolve under `--conditions react-server`; react-dom renders
the client half without it). That worker is `node:worker_threads`, and the
streams it speaks are `node:stream` / `MessagePort`. Edge runtimes such as
Cloudflare Workers and Deno Deploy have no `worker_threads`, so this path does
not run there. The cross-condition worker is also what lets the single-condition
ESM transport render both halves at all — see
[Workers](./internals/workers.md) and [How vprs compares](./comparison.md).

The runtime RSC-payload and server-action helpers are likewise implemented on
Node primitives today. A *static* build has no server runtime and therefore no
callable surface, so this only applies once you stand up a dynamic server.

**The pattern for an edge deployment today is hybrid:** serve `dist/static/`
from the edge/CDN (instant, global, no runtime) and put any dynamic SSR or
server actions on a Node origin behind it. vprs does not currently ship an
in-process edge SSR path (`react-dom/server.edge`, no worker); whether to add
one is an open question, not a present feature. If first-class edge SSR is a
hard requirement, `@vitejs/plugin-rsc` reaches the edge in-process today (via
Vite's environment API and Cloudflare's child-environment workers) and is the
better fit.

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

## Optional: `dist/server-edge/` (single-isolate edge bundle)

With `build.edge.singleIsolate: true`, the build emits one extra artifact:

```
dist/
└── server-edge/
    └── render.js      # baked Flight producer, React inlined (server condition)
```

This is **additive** — the three directories above are untouched. `render.js`
exports `renderRouteToFlight(url)` and runs in a single isolate with no
`worker_threads` and no runtime `--conditions`, for edge runtimes. Pair it with
`createEdgeHandler` to get a Web `fetch` handler. See [Edge / Single-Isolate](./edge.md).

## Environment Variables

The plugin sets these automatically if not provided:

- `VITE_MODE` — build mode
- `VITE_DEV` / `VITE_PROD` — boolean flags
- `VITE_SSR` — true during SSR builds
- `VITE_PUBLIC_ORIGIN` — base URL for assets
- `VITE_BASE_URL` — application base URL

Access them in server components via `process.env`.
