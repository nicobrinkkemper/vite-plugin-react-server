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
    edge: {
      singleIsolate: true,   // emit dist/server-edge/render.js
      // outDir: "server-edge",
      // minify: true,        // default; turn off to inspect the bundle
    },
  },
});
```

| option         | default        | meaning |
| -------------- | -------------- | ------- |
| `singleIsolate`| `false`        | emit the baked edge bundle |
| `outDir`       | `"server-edge"`| output dir, under `build.dir` |
| `minify`       | `true`         | minify the bundle. It bakes React in, so it is large; edge platforms cap bundle size. Set `false` for readable output. |

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
