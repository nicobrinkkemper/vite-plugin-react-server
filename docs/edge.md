# Edge / Single-Isolate Rendering

The default build renders HTML through worker threads under a `--conditions
react-server` process flag. That model is great on Node, but it does not fit
edge runtimes (Cloudflare Workers, Deno Deploy, Vercel Edge, Bun), which have no
`worker_threads` and no process-level export conditions.

The **single-isolate edge build** removes both requirements. It bakes a second,
self-contained bundle in which React is **inlined** under the `react-server`
condition at build time, so the running isolate needs no `worker_threads` and no
runtime `--conditions`. You get flash-free streaming SSR from one Web `fetch`
handler.

It is **additive**: the normal `dist/server` / `dist/static` output is untouched.
Dev is unaffected.

## How it works

Two bundles co-exist in one isolate:

- **`dist/server-edge/render.js`** — the Flight *producer*. React is baked under
  the `react-server` condition (server components), so this is where your Page
  renders to an RSC Flight stream. It exports one function:

  ```ts
  export function renderRouteToFlight(url: string): Promise<ReadableStream<Uint8Array>>;
  ```

  It is a **closed manifest** over `build.pages`: every prerendered route is
  baked in by static import, so there is no runtime `import()`. An unknown url
  throws.

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

| option    | default        | meaning |
| --------- | -------------- | ------- |
| `outDir`  | `"server-edge"`| output dir, under `build.dir` |
| `minify`  | `true`         | minify the bundle. It bakes React in, so it is large; edge platforms cap bundle size. Set `false` for readable output. |

## Serve it: `createEdgeHandler`

`createEdgeHandler` composes the producer and the HTML render into a standard
Web `(Request) => Response` handler — the native entrypoint shape for edge
runtimes:

```ts
import { renderRouteToFlight } from "./dist/server-edge/render.js";
import { createEdgeHandler } from "vite-plugin-react-server/stream";

const handler = createEdgeHandler({
  render: renderRouteToFlight,
  moduleBaseURL: "/",                       // where dist/client is served
  bootstrapModules: ["/client-abc123.js"],  // your client entry (for hydration)
});

export default { fetch: handler };          // Cloudflare / Deno / Bun
```

The handler **streams** (responds when the HTML shell is ready), returns **404**
for a url the bundle was not baked with (override via `onNotFound`), and
propagates other render errors after `onError`.

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

The bootstrap entry is your client entry's hashed filename, read from the client
build manifest (`dist/client/.vite/manifest.json`) — the same mapping the static
build uses:

```ts
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("dist/client/.vite/manifest.json", "utf8"));
const entry = manifest["src/client.tsx"]?.file;      // e.g. "client-abc123.js"
const bootstrapModules = entry ? ["/" + entry] : [];
```

> Keep `moduleBaseURL` and the `bootstrapModules` prefix in sync with where you
> actually host `dist/client`. A non-root deploy base (e.g. GitHub Pages) is the
> usual reason hydration breaks — verify in a real prod build at the real base.

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

## When to use it

- **Use it** for edge runtimes, or any single-process deploy where you want
  flash-free streaming SSR without `worker_threads` or a `--conditions` flag.
- **Stick with the default** worker-based build for Node servers that already
  run under `--conditions react-server`, or for purely static (SSG) hosting —
  the edge bundle is an extra artifact you do not need there.

## Limitations

- The producer is a closed enumeration of `build.pages`; it is not a dynamic
  router. Unbaked urls 404.
- The bundle inlines React, so it is large — keep `minify: true` for deploys and
  watch your platform's size limit.
- `createEdgeHandler` / `renderFlightToHtml` are client-condition exports (they
  run client React); import them from `vite-plugin-react-server/stream` **without**
  the `react-server` condition. Only the baked `render.js` is server React.
- The baked action gate (`handleRouteAction`) enumerates `*.server.*` modules as
  the allowlist — a `"use server"` action must live in such a module (the common
  convention). Inline `"use server"` in a non-`.server.` file is not baked.
