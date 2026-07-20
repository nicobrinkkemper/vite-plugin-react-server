# Edge / Single-Isolate Rendering

The default build renders HTML through worker threads under a `--conditions
react-server` process flag. That model is great on a full Node server, but it
does not fit single-process targets — serverless functions and edge-style
runtimes (Bun, Deno, Vercel/Netlify Functions) — which have no `worker_threads`
and no process-level export conditions.

The **single-isolate edge build** removes both requirements. It bakes a second,
self-contained bundle in which React is **inlined** under the `react-server`
condition at build time, so the running isolate needs no `worker_threads` and no
runtime `--conditions`. You get flash-free streaming SSR from one Web `fetch`
handler.

One naming precision: "edge" here refers to the single-isolate *shape*, not to a
literal V8-isolate runtime. Which runtimes the handler reaches is a property of
the **transport** the render path uses, picked at build time
(`build.edge.transport`):

- **`"esm"`** (the default) resolves client islands with
  `import(moduleBaseURL + id)` off disk and react-dom through the Node module
  resolver at request time. Its homes are **Node-compatible hosts**: Node
  servers, Bun, Vercel/Netlify Node functions.
- **`"webpack"`** resolves references through a closed module map instead, and
  the bake additionally emits a baked **consumer**
  (`dist/server-edge/consumer.js`): client React plus every client-reference
  module behind a closed registry. That pair composes to a bundle with **no
  `node:` imports and no `process` dependency** — what a filesystem-less
  runtime (Cloudflare Workers, Deno Deploy) requires. Serve it through
  `vite-plugin-react-server/edge/web` — see
  [Workers / Deno](#workers--deno-the-baked-consumer-and-edgeweb) below.

It is **additive**: the normal `dist/server` / `dist/static` output is untouched.
Dev is unaffected.

## How it works

Two bundles co-exist in one isolate:

- **`dist/server-edge/render.js`** — the Flight *producer*. React is baked under
  the `react-server` condition (server components), so this is where your Page
  renders to an RSC Flight stream. It exports one function:

  ```ts
  export function renderRouteToFlight(url: string, request?: Request): Promise<ReadableStream<Uint8Array>>;
  ```

  It is a **closed manifest**: every module is baked in by static import, so
  there is no runtime `import()`. The enumerated `build.pages` set is baked
  route-by-route; with the [file router](./routing.md), each dynamic route
  *pattern*'s modules are baked once as well, so an unenumerated concrete url
  (any `/profile/<id>` that was not in `staticPaths`) still renders per-request
  by matching the route patterns. A url matching nothing throws — which
  `createEdgeHandler` turns into a 404. Pass the in-flight `request` so a
  loader can gate on cookies/headers (authenticated routes); it is `undefined`
  at prerender.

- **`dist/client`** — the client (ssr) bundle. React is the normal client build.
  The HTML render and client islands live here.

`renderFlightToHtml` decodes the Flight stream and renders HTML in the **same
process** under client React. Client islands resolve through the client
transport's native `import(moduleBaseURL + id)` into `dist/client` — no
condition-sensitive resolution. The two React copies never collide because each
was baked into its own graph.

```
Request ──▶ renderRouteToFlight(url)  ──▶ Flight stream   (dist/server-edge, server React)
                                            │
                                            ▼
            renderFlightToHtml(...)   ──▶ HTML stream     (dist/client,     client React)
                                            │
                                            ▼
                                         Response
```

## Enable it

```ts
// vite.config.ts
vitePluginReactServer({
  moduleBase: "src",
  Page: "src/page.tsx",
  props: "src/props.ts",
  build: {
    pages: ["/"],
    // edge is ON by default. Omit it entirely to get the defaults, or:
    //   edge: false             — opt out (no dist/server-edge artifact)
    //   edge: { minify: false } — keep on, tune a default
  },
});
```

`build.edge` is `boolean | { outDir?, minify? }`, default **`true`** (the bundle
is additive — the worker-based `dist/server` build is untouched — and a bake
failure is a warning, never a build failure).

| form                     | meaning |
| ------------------------ | ------- |
| `edge: true` / omitted   | emit the baked edge bundle with defaults |
| `edge: false`            | opt out — no `dist/server-edge` artifact |
| `edge: { … }`            | emit, with overrides (presence means enabled) |

| option      | default        | meaning |
| ----------- | -------------- | ------- |
| `outDir`    | `"server-edge"`| output dir, under `build.dir` |
| `minify`    | `true`         | minify the bundle. It bakes React in, so it is large; edge platforms cap bundle size. Set `false` for readable output. |
| `transport` | `"esm"`        | which RSC transport the baked render path uses. `"webpack"` additionally emits the baked consumer (`consumer.js`) for filesystem-less runtimes. Transports don't mix: prerendered `.rsc`/inline-flight snapshots are esm-encoded, so a webpack deploy serves **every** route through the edge bundle and drops the page snapshots from what it hosts. |

## Serve it: `createEdgeRequestHandler`

Hand the baked bundle to `createEdgeRequestHandler` and you have the server:

```ts
import * as bundle from "./dist/server-edge/render.js";
import { createEdgeRequestHandler } from "vite-plugin-react-server/edge";

export const handler = createEdgeRequestHandler(bundle);

export default { fetch: handler };   // Node server, Bun, a Node serverless function
```

That is the whole thing: a Web `(Request) => Response` serving the flash-free
document on a GET, the headless flight on a client navigation, and `"use server"`
actions through the bundle's baked gate.

Import the bundle as a **namespace** and pass it whole. It carries its own routes,
styles, client entry and action gate, so there is nothing to wire up — and a
static import stays visible to a deploy's file tracer. Handing over a *path* for
the handler to `import()` at runtime is what makes the module go missing on the
platforms this handler exists to serve.

`vite-plugin-react-server/edge` is condition-neutral: it resolves to the same
module with or without `--conditions react-server`, so it is safe to import from
code that a react-server-condition build also loads.

This entry injects vprs's own flight → HTML renderer as the default — which
resolves react-dom through the Node module resolver, and is exactly what keeps
`createEdgeRequestHandler(bundle)` zero-config on Node. Bundling for a Worker,
use `/edge/web` instead (next section): same factories, no Node renderer in the
module graph.

### Options

| option          | default            | meaning |
| --------------- | ------------------ | ------- |
| `dynamic`       | every baked route  | which routes render per request — a predicate, or a list of urls and/or route patterns (`/blog/$slug`). A serving-layer choice, so one build can be served static, dynamic, or a mix. |
| `projectRoot`   | —                  | forwarded to the baked action gate |
| `actionHeader`  | `"x-rsc-action"`   | header marking a POST as a server action |
| `rscOutputPath` | `"index.rsc"`      | filename the client router fetches a flight from |

It also accepts `createEdgeHandler`'s options below (`headers`, `nonce`,
`onError`, `onNotFound`, …). `moduleBaseURL` and `bootstrapModules` come from the
bundle's own bake; set them only to override.

### Serving files from the same process

`createEdgeRequestHandler` touches no filesystem: assets and prerendered
snapshots are the host's to serve, and a CDN does it better. To serve them from
disk anyway — a local runner, a Node self-host — compose `createEdgeRenderHook`
into `createRequestHandler`:

```ts
import { createServer } from "node:http";
import { createRequestHandler, toNodeListener } from "vite-plugin-react-server/request-handler";
import { createEdgeRenderHook } from "vite-plugin-react-server/edge";
import * as bundle from "./dist/server-edge/render.js";

const app = createRequestHandler({
  staticDir: "dist/static",
  render: createEdgeRenderHook(bundle),   // null for a route it doesn't render
  action: bundle.handleRouteAction,
});

createServer(toNodeListener(app)).listen(8787);
```

## Workers / Deno: the baked consumer and `/edge/web`

With `build.edge.transport: "webpack"`, the bake emits **two** bundles:

- `dist/server-edge/render.js` — the producer, as above, rendering through the
  webpack transport's closed client manifest.
- `dist/server-edge/consumer.js` — the flight → HTML half: client React,
  `react-dom/server.edge`, the webpack flight client, and **every
  client-reference module compiled in** behind a closed registry. It exports
  `renderFlightToHtml` with the runtime renderer's contract minus the options
  that describe how to *find* things (`moduleBaseURL`, `clientManifest`,
  `flightTransport`) — the bundle already contains them.

Compose them through the `/edge/web` entry:

```ts
import * as bundle from "./dist/server-edge/render.js";
import { renderFlightToHtml } from "./dist/server-edge/consumer.js";
import { createEdgeRequestHandler } from "vite-plugin-react-server/edge/web";

export default { fetch: createEdgeRequestHandler(bundle, { renderFlightToHtml }) };
```

That whole request path — producer, consumer, handler — bundles for a Worker
with **zero `node:` import specifiers and zero `require`**, and runs with no
`process` global at all.

`/edge/web` exists because the difference from `/edge` is the module **graph**,
not behavior: `/edge` can reach vprs's built-in Node renderer, and even an
unreached dynamic import is a specifier every bundler resolves — so a Worker
build from that entry drags `node:module` in. `/edge/web` cannot reach it,
which is why `renderFlightToHtml` is **required** there (checked at creation,
so a handler that cannot render fails at compose time, not first request).
Like `/edge`, it is condition-neutral.

Two constraints to know:

- **Transports don't mix.** Prerendered `.rsc` snapshots and inline-flight
  payloads are esm-encoded; a webpack-transport client cannot decode them. A
  webpack deploy serves every route through the edge bundle and does not host
  the page snapshots (assets and chunks are still the CDN's to serve).
- The consumer bakes **client React in**, so it is a second large artifact —
  the same size trade as the producer, for the same reason.

`createEdgeRequestHandler` is built on `createEdgeHandler`, which composes the
producer and the HTML render into a standard Web `(Request) => Response` handler.
Reach for it directly only to drive the producer yourself:

```ts
import { renderRouteToFlight } from "./dist/server-edge/render.js";
import { createEdgeHandler } from "vite-plugin-react-server/stream";

const handler = createEdgeHandler({
  render: renderRouteToFlight,
  moduleBaseURL: "/",                       // where dist/client is served
  bootstrapModules: ["/client-abc123.js"],  // your client entry (for hydration)
});

export default { fetch: handler };          // Node server, Bun, a Node serverless function
```

The handler **streams** (responds when the HTML shell is ready), returns **404**
for a url that matches no baked route or route pattern (override via
`onNotFound`), and propagates other render errors after `onError`.

### Options

| option                  | default                          | meaning |
| ----------------------- | -------------------------------- | ------- |
| `render`                | —                                | the baked `renderRouteToFlight` |
| `moduleBaseURL`         | `"/"`                            | base url where `dist/client` is served; client islands resolve against it. Mind a non-root deploy base. |
| `bootstrapModules`      | `[]`                             | client entry module(s) to bootstrap hydration |
| `bootstrapScriptContent`| —                                | inline bootstrap script |
| `nonce`                 | —                                | CSP nonce |
| `getURL`                | `req => new URL(req.url).pathname` | map a Request to a baked route url |
| `headers`               | —                                | merged over the default `content-type: text/html` |
| `onError`               | —                                | render-error hook |
| `onNotFound`            | 404 `text/plain`                 | response for an unbaked route |

### Finding `bootstrapModules`

You don't. The bake reads the client entry's hashed filename out of the build
manifest and exports it from the bundle as `bootstrapModules`, alongside
`clientModuleBaseURL` (the built client bundle, resolved from `import.meta.url`).
`createEdgeRequestHandler` uses both, which is why it needs no wiring.

This is baked rather than read at runtime because a server that reads
`.vite/manifest.json` on each boot forces the deploy to ship that dot-directory
to the function — and platforms decline to in ways that only surface in
production (Vercel's `includeFiles` glob skips dot-dirs, and its tracer will not
follow a JSON import). Baking it into the module the server already imports
leaves nothing extra to ship.

Only when driving `createEdgeHandler` yourself do you pass them by hand:

```ts
import * as bundle from "./dist/server-edge/render.js";

createEdgeHandler({
  render: bundle.renderRouteToFlight,
  moduleBaseURL: bundle.clientModuleBaseURL,
  bootstrapModules: bundle.bootstrapModules,
});
```

> A non-root deploy base (e.g. GitHub Pages) is the usual reason hydration
> breaks. The baked values already honor `base`; if you override them, keep
> `moduleBaseURL` and the `bootstrapModules` prefix in sync with where you
> actually host the client build — and verify in a real prod build at the real
> base.

## Run it on Node

On a real edge platform you export the handler directly. On Node, wrap it in a
tiny adapter that serves `dist/client` and routes the rest through the handler.
The `examples/hello-world` example ships a complete one — see
[`edge-server.mjs`](../examples/hello-world/edge-server.mjs):

```bash
cd examples/hello-world
npm run build        # emits dist/server-edge/render.js + dist/client
npm run edge         # node edge-server.mjs → http://localhost:8787
```

## Flash-free documents (`renderRouteToDocument`)

`renderRouteToFlight` renders partial markup. For a **full flash-free document** —
one whose initial HTML carries the live data and hydrates with no `.rsc` refetch —
the bundle also exports `renderRouteToDocument`:

```ts
renderRouteToDocument(url, { cssFiles, globalCss }): Promise<{
  full: ReadableStream;      // Html/Root-wrapped document flight
  headless: ReadableStream;  // Root-only #root contents, for the inline payload
}>
```

`createEdgeHandler`'s **document mode** drives it: it renders `full` to a complete
HTML document and inlines `headless` as `<script id="vprs-flight">`, so the browser
hydrates in place.

```ts
const handler = createEdgeHandler({
  renderDocument: (url) => renderRouteToDocument(url, { cssFiles }),
  moduleBaseURL: pathToFileURL(join(buildDir, "client")).href + "/", // ssr bundle, on disk
  bootstrapModules: ["/" + clientEntry],
});
```

> The in-process render decodes the flight under client React and resolves
> client-component references by importing them from the **ssr bundle**
> (`dist/client`) — so `moduleBaseURL` here is that directory as a **file URL**,
> not the browser's HTTP base. The browser hydrates from its own base separately;
> the client-component filenames are hash-identical across `dist/client` and
> `dist/static`, so the same refs resolve on both sides.

Pass live `cssFiles`/`globalCss` (a `Map<string, CssContent>`, e.g. via
`collectManifestCss`) so the document and the inline payload carry the same styles.

## Server actions, no `--conditions` (`handleRouteAction`)

A `"use server"` app needs the server RSC transport to decode/dispatch actions —
which normally forces `--conditions react-server` and so conflicts with the
client-React document render above. The bundle resolves this by **baking the
action gate** too: it exports `handleRouteAction`, a sealed gate over the action
modules (the `*.server.*` allowlist) baked in with server React, so the action
path never disk-imports the transport.

```ts
import { createRequestHandler } from "vite-plugin-react-server/request-handler";

const { renderRouteToDocument, handleRouteAction } = await import(edgeBundleUrl);

const handler = createRequestHandler({
  staticDir,
  action: (request) => handleRouteAction(request, { projectRoot }), // baked gate (a function)
  render: async (pathname, request) => { /* renderDocument for dynamic routes */ },
});
```

`createRequestHandler` lazy-imports its built-in (disk) gate, so passing the baked
**function** keeps the whole server condition-neutral. The baked gate is still a
sealed allowlist — an id the build did not enumerate is rejected. This is the
shape that runs a full server-actions app (live data + flash-free SSR) in one
isolate with `NODE_OPTIONS` unset; see the bidoof-template demo's `start.tsx`.

> ⚠️ **Do not statically import or re-export your built `*.server.*` modules in
> the no-`--conditions` process.** A built `"use server"` module imports the
> react-server transport at load (`registerServerReference`), which asserts the
> `react-server` condition and **crashes the server at startup**. Let the baked
> gate own them — dispatch through `handleRouteAction` and keep the entry a
> side-effect import. The actions are still built (reachable via your
> pages/props), so the gate's allowlist is unchanged.

```ts
// ❌ server/index.ts — crashes at startup with no --conditions:
//    "The react-server condition must be enabled ..."
export { addTodo } from "./actions.server.js"; // ← pulls the react-server transport
import "./start.js";

// ✅ server/index.ts — side-effect import only; nothing here pulls the transport
import "./start.js";
// addTodo & co. are dispatched at request time through the baked gate
// (handleRouteAction), which carries its own server React.
```

## When to use it

- **Use it** for any single-process deploy where you want flash-free streaming
  SSR without `worker_threads` or a `--conditions` flag — the default transport
  on Node-compatible hosts, the webpack transport (+ baked consumer) on
  Cloudflare Workers / Deno Deploy.
- **Stick with the default** worker-based build for Node servers that already
  run under `--conditions react-server`, or for purely static (SSG) hosting —
  the edge bundle is an extra artifact you do not need there.

## Limitations

- The producer is a closed manifest of baked modules. With the file router,
  unenumerated urls that match a route *pattern* render per-request; urls that
  match no pattern (and are not in `build.pages`) 404. There is no runtime
  `import()` of new modules.
- The bundle inlines React, so it is large — keep `minify: true` for deploys and
  watch your platform's size limit.
- `createEdgeHandler` / `renderFlightToHtml` are client-condition exports (they
  run client React); import them from `vite-plugin-react-server/stream` **without**
  the `react-server` condition. Only the baked `render.js` is server React.
  `vite-plugin-react-server/edge` and `/edge/web` have no such caveat — each
  resolves to one module under either condition and defers any client-React
  import until a render, so importing them from a react-server build is safe.
- The baked action gate (`handleRouteAction`) enumerates `*.server.*` modules as
  the allowlist — a `"use server"` action must live in such a module (the common
  convention). Inline `"use server"` in a non-`.server.` file is not baked.
