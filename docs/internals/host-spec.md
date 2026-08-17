# Host spec — `createHost` over per-target manifests (draft)

Status: DRAFT for review. Companion to the runner spec: that one declares the
paradigm at build time; this one makes prod serving a one-liner over the
artifacts the build already emits. Prod stays "a thin host over the emitted
artifacts and manifest" — this spec makes the thin host something vprs hands
you instead of something every consumer re-derives.

## Problem

The build emits everything a server needs, and then the consumer writes the
server by hand anyway. The official demo's `start.tsx` is ~180 lines, and
every load-bearing line re-states knowledge an artifact already holds:

| hand-written in the consumer server | where the build already knows it |
| --- | --- |
| `/^\/pokedex\/[^/]+$/` — which URLs render dynamically | the router's route table (`routePatterns`, `staticPaths`) |
| `existsSync(join(staticDir, route, "index.html"))` — prerendered or not | the prerender worklist that emitted `dist/static` |
| `collectManifestCss(manifest, "src/css/pokemon.module.css")` + inline-threshold dance | the static manifest + the same `css.inlineThreshold` the build used |
| `staticManifest["index.html"].file` — bootstrap module for hydration | the client build's manifest |
| reading `dist/static/404/index.html` to answer `notFound()` | the prerendered 404 page |
| `handleRouteAction(request, { projectRoot })` wiring | the baked sealed gate in `dist/server-edge/render.js` |
| `pathToFileURL(join(buildDir, "client"))` as `moduleBaseURL` | the build laid out `dist/client` for exactly this |

None of this is configuration — it is archaeology. The consumer can get every
line subtly wrong (stale-port serving, bare-text 404s, missing charset-era
bugs all shipped this way in real consumers), and no two consumers write the
same server.

Two well-known escapes exist and both are rejected:

- **Become a framework**: own the server, the listener, the deploy story.
  Rejected — it inverts ownership. vprs consumers mount vprs into *their*
  server, never the reverse (see the router design boundary: escape hatches,
  not core).
- **Stay as-is**: every consumer copies the demo's `start.tsx` and drifts.
  Rejected by the evidence above.

## The API

Two entry shapes, one contract — because "read an arbitrary directory at
runtime" and "run on workerd" are incompatible. A fetch runtime needs its
imports statically discoverable at bundle time; it cannot `readFile` a
manifest or dynamically import `../server-edge/render.js` from a `buildDir`
it has no filesystem for. So the filesystem-walking form is a **Node-only
convenience**, and the portable form is a **generated host entry** the build
emits with every import baked in:

```ts
// Node (convenience form): inspects buildDir at startup.
import { createHost, toNodeListener } from "vite-plugin-react-server/host";
http.createServer(toNodeListener(createHost({ buildDir: "./dist" }))).listen(3000);
```

```ts
// Any fetch runtime (portable form): the build emits dist/server-edge/host.js —
// a generated module that statically imports its render/consumer bundles and
// inlines its manifest, then calls the same core with resolved artifacts.
import handler from "./dist/server-edge/host.js";
export default { fetch: handler };               // workerd / Bun / Deno
export default handler;                          // Vercel function
```

Both forms delegate to one runtime-agnostic core,
`createHostFromManifest({ manifest, loadRender, serveStatic })` — the Node
form derives those from `buildDir`; the generated entry bakes them. The
handler owns **routing between the artifacts**: static files for prerendered
URLs, per-request render for dynamic ones, the action gate for
`x-rsc-action` POSTs, the prerendered 404 for everything else. It owns no
listener, no port, no process — the consumer mounts it, wraps it, or
composes middleware around it. `toNodeListener` remains the Node adapter it
already is.

## The host manifest

Derivation needs a stable contract, not directory spelunking. The build emits
one additional artifact:

Each host flavor gets its OWN manifest next to its own artifacts —
`dist/server/host-manifest.json` for the Node/worker serving path,
`dist/server-edge/host-manifest.json` baked into the generated edge entry —
because one build can legitimately emit BOTH (the runner spec keeps
`build.edge` as an artifact knob on the `main`/`isolated` runners). A single
shared manifest would leave such a build with two valid deployment targets
and no way to say which one a given host serves; per-target manifests make
each entry self-describing.

The shared core (routing + policy) is identical in both; only the render
source and how relative paths resolve differ. The edge shape, whose paths
resolve against its own directory:

```
dist/server-edge/host-manifest.json
{
  "version": 1,
  "target": "edge",
  "base": "/",
  "routes": [
    { "pattern": "/pokedex/$name", "dynamic": true },
    { "pattern": "/pokedex/gen/$gen", "dynamic": true },
    { "pattern": "/", "dynamic": false }
  ],
  "prerendered": ["/", "/pokedex", "/pokedex/pikachu", "…"],
  "assets": ["index-abc123.js", "assets/css/pokemon-xyz.css", "…"],
  "cssByPattern": { "/pokedex/$name": ["assets/css/pokemon-xyz.css"] },
  "inlineThreshold": 10000,
  "bootstrapModules": ["/index-abc123.js"],
  "notFoundPage": "404/index.html",
  "errorPage": "500/index.html",
  "etags": { "index.html": "W/\"a1b2c3\"", "…": "…" },
  "precompressed": ["br", "gzip"],
  "transport": "webpack",
  "renderBundle": "./render.js",
  "consumerBundle": "./consumer.js"
}
```

The Node/worker shape (`dist/server/host-manifest.json`) carries the same
routing and policy fields with `"target": "node"`, and instead of the baked
pair it names ITS render source: the server bundle's request entry (and the
worker files when the build is worker-based). `assets` is the exact-match
inventory step 2 of the request algorithm serves from — every emitted static
file that is not a prerendered document — so asset serving derives from the
manifest like everything else, not from an existsSync per request.

Everything in it is information the build holds at emit time; nothing is
computed at runtime that the build already computed. The file is versioned so
the host helper and the plugin can evolve independently — a host reading a
manifest it doesn't understand fails loudly at startup, not per-request.

`cssByPattern` retires the per-route `collectManifestCss` dance: the build
walks each route's page module once and records the resolved CSS files; the
host applies the same inline-vs-link threshold the static build used, so a
per-request document and its prerendered sibling agree by construction.

`transport` + `consumerBundle` make the flavor a followed fact instead of a
wiring exercise. Under a webpack bake the host renders HTML through the baked
consumer (the runtime esm consumer cannot resolve module-map reference rows —
hand-wired servers hit this as a 500 with "Element type is invalid"), and it
stamps the `self.__vprsFlightTransport` hint on every per-request document it
serves (prerendered documents carry the hint from the freeze; a live document
without it hydrates through the wrong decoder and dies with React #306). Both
were rediscovered by hand in the official demo's server; under `createHost`
neither is a consumer decision.

## Request algorithm

For `GET`/`HEAD` on `pathname`:

1. Normalize: base strip, `.rsc` suffix detection, trailing-slash
   canonicalization (`/pokedex` → 308 → `/pokedex/`, matching what the
   prerender emitted — one URL per page, not two).
2. **Exact asset lookup, before any routing.** `pathname` matches a file in
   the manifest's `assets` inventory (hashed chunks, CSS, images, fonts —
   every emitted static file that is not a prerendered document) → serve it
   with the asset cache profile. The classification is the manifest's, not
   the adapter's: once a path is a known static artifact, route matching
   never sees it — a catch-all pattern must not swallow
   `/assets/app-abc123.js` and render a 404 document for it. Serving goes
   through the `serveStatic` seam (below); an adapter MISS on a known
   artifact is answered with a plain 404 naming the asset, never by falling
   through to a render. Under `statics: "platform"` the platform normally
   answers these before the handler runs; the same rule covers the ones
   that still reach it.
3. `pathname` in `prerendered` → serve the static document (same
   `statics: "platform"` delegation).
4. Else match `routes`; a `dynamic` match → per-request render through the
   render bundle (full document, or headless flight for `.rsc`/Accept), with
   the pattern's CSS, under the request's abort signal and a render
   deadline.
5. Outcomes are kept distinct — this is a server, not a router with one
   apology page:
   - loader `notFound()` / no match → the prerendered 404 page, status 404;
   - loader `redirect()` → the 3xx, passed through;
   - render **failure** (thrown error, upstream fetch dead, deadline hit) →
     status **500** with the error page, after `onError` — never disguised
     as a 404, never a clean 200. There is deliberately no stale-fallback
     knob: step 3 serves every prerendered URL before a render is attempted,
     so by the time a render fails there is no prerendered copy of that URL
     to fall back to. A serve-prerendered-but-revalidate-per-request mode
     (which WOULD create that fallback window) is real scope, but it needs
     its own revalidation semantics — out of scope for v1.

`POST` with the action header → the baked sealed gate (its own 404/500
separation follows the same rule). Everything else → 405 with `Allow`.

## Prod-grade HTTP

The reason to bless one host is that nobody hand-writes this layer — no
consumer `start.tsx` ever grew conditional requests. All of it derives from
the manifest at startup; none of it is computed per-request from disk:

- **Conditional requests**: every static file gets an `ETag` from the build's
  content hashes (recorded in the host manifest — no runtime hashing);
  `If-None-Match` answers 304. Dynamic renders are uncacheable and say so.
- **Cache profiles**: content-hashed assets → `immutable, max-age=1y`;
  prerendered `index.html`/`index.rsc` → `no-cache` (revalidate, serve 304);
  dynamic documents and flight → `no-store`. The `.rsc`/document split on
  one URL sets `Vary: Accept`, so a shared cache never serves flight bytes
  to a browser.
- **Compression**: the build emits precompressed `.br`/`.gz` siblings for
  compressible statics (build knob, default on); the host negotiates via
  `Accept-Encoding` and never compresses at request time. Dynamic streams
  pass through uncompressed by default (streaming first; platform
  compression where available).
- **Correct metadata everywhere**: `text/html; charset=utf-8` and friends
  from one MIME table (the charset half of a real hydration bug this month),
  `Content-Length` where known, honest `HEAD`, `X-Content-Type-Options:
  nosniff`. Anything more opinionated (CSP, HSTS) is app policy — wrap the
  handler.
- **Timeouts and cancellation**: the request's `AbortSignal` reaches the
  loader (already the loader contract); a `renderDeadlineMs` (default 30s)
  turns a hung upstream into a 500, not a hung connection.
- **Error page**: the manifest names it. If the app defines a `/500` route
  it is prerendered and used; otherwise the build emits a minimal styled
  fallback. Same rule as the 404: a miss or failure never produces a
  bare-text body.

## One host, three runners

The runner spec's paradigm matrix has a "prod shape" row; `createHost` is
that row implemented once, flavored by what the runner baked:

| | `main` | `isolated` | `edge` |
| --- | --- | --- | --- |
| render source | in-process render under the process flag | rsc-worker bridge | baked pair (`render.js`) |
| host runtime needs | Node + `--conditions react-server` | Node, no flag | any fetch runtime, no `node:*` |
| static serving | host serves `dist/static` | host serves | `statics: "platform"` default — the CDN/platform serves, handler answers only dynamic + actions |

The consumer never states which flavor: the host manifest records what the
build emitted, and `createHost` follows it. A mismatch (edge bundle absent,
worker files missing) is a startup error naming the runner that would fix it.

## Knobs

```ts
createHost({
  buildDir: "./dist",
  statics?: "serve" | "platform",   // default per runner (table above)
  onNotFound?: (url, request) => Response | null,  // null → prerendered 404
  onError?: (error, url) => void,   // default: console.error (never swallow)
  renderDeadlineMs?: number,        // default 30_000 → 500, not a hung socket
  cache?: (url) => HeadersInit,     // override the cache-profile defaults
  rewrite?: (url) => string | null, // escape hatch before matching
})
```

The knobs are not Node-only. The generated edge entry exports the SAME
option surface as a factory, with the zero-config default handler built from
it:

```ts
// dist/server-edge/host.js (generated) — shape, not implementation:
export function createHost(options?: HostOptions): (request: Request, ...platform) => Promise<Response>;
export default createHost();   // the zero-config handler
```

`HostOptions` here is every knob above except `buildDir` (the entry's
artifacts are baked; there is no directory) and `statics: "serve"` (a fetch
runtime has no filesystem to serve from), plus the seam that makes
`statics: "platform"` a contract instead of hand-waving:

```ts
serveStatic?: (request: Request, ...platform: unknown[]) => Promise<Response | null>,
// null → the ADAPTER couldn't serve it. What happens next is the
// manifest's call, not the adapter's: a path classified as a known static
// artifact (assets / prerendered) answers 404 naming the file; only paths
// the manifest doesn't know continue to route matching. An adapter miss
// can therefore never leak an asset URL into a catch-all render.
```

This is the same `serveStatic` the shared `createHostFromManifest` core
already takes — the Node form derives it from `buildDir`, and a platform
wrapper passes the platform's own asset layer. The handler is created ONCE
at module scope; the platform's per-request arguments (workerd's `env`,
`ctx`) arrive as the handler's trailing arguments and are forwarded to the
seam:

```ts
// workerd, assets binding — created once, not per fetch:
const handler = createHost({
  serveStatic: async (req, env) => {
    const res = await (env as { ASSETS: { fetch: typeof fetch } }).ASSETS.fetch(req);
    return res.status === 404 ? null : res;
  },
});
export default { fetch: handler };
```

Small on purpose. Anything beyond this is composition: wrap the returned
handler. Ejecting stays possible — `createRequestHandler`, `createEdgeHandler`,
`collectManifestCss`, `toNodeListener` remain exported, and `createHost` is
specified as expressible in terms of them (it is the blessed composition, not
a private pipeline).

## Worked example

The official demo's production server, today (abridged from ~180 lines):

```ts
const pokemonCss = toCssMap(collectManifestCss(staticManifest, "src/css/pokemon.module.css"));
const clientEntry = staticManifest["index.html"]?.file;
// … 40 lines of manifest/css/bootstrap assembly …
render: async (pathname, request) => {
  const route = pathname.replace(/\/index\.rsc$|\.rsc$|\/$/, "");
  if (!/^\/pokedex\/[^/]+$/.test(route)) return null;
  if (fs.existsSync(path.join(staticDir, route.slice(1), "index.html"))) return null;
  // … flight-vs-document branch, notFound dressing, error handling …
}
```

After:

```ts
import http from "node:http";
import { createHost, toNodeListener } from "vite-plugin-react-server/host";

http.createServer(toNodeListener(createHost({ buildDir: "../.." }))).listen(3000);
```

The deleted lines are the point: nothing in them was a decision. The
decisions that DO exist (custom 404 behavior, cache policy, rewrites) are the
knobs that remain.

## Non-goals

- Owning a listener, a port, a process manager, or a deploy target. The
  handler is mountable; mounting is the consumer's.
- Runtime configuration. The host manifest is a build artifact; changing
  behavior means rebuilding or wrapping the handler. Nothing in `dist/`
  reads `vite.config` at runtime.
- Replacing the runner spec. The runner decides what gets baked; the host
  follows the bake. They compose; neither implies the other.
- Dev serving. The dev server already owns that surface; this is prod only.

## Resolutions (proposed, for review)

1. **Explicit `host-manifest.json` over directory inference — one per host
   flavor.** Inference (existsSync-per-request, glob-the-static-dir) works
   until base paths, platform statics, or `.html`-suffixed prerenders make
   it lie. An emitted file, versioned, is the contract; the build is the
   only writer — and it writes one PER emitted host target, so a build
   carrying both a Node serving path and a `build.edge` artifact has two
   self-describing entries instead of one ambiguous manifest with two valid
   deployments.
2. **`statics: "platform"` is the edge default.** Serving static files from
   an edge function is paying compute to imitate a CDN; the platform serves
   statics and the handler answers only what needs compute. `"serve"` stays
   the Node default so `npm run demo` works with zero platform assumptions.
3. **404 and 500 are different failures with different pages.** The
   prerendered 404 answers misses (unknown route, loader `notFound()`); a
   render failure answers 500 with the error page after `onError`. Bare-text bodies from inner
   handlers are a host-layer bug. Collapsing failures into one apology page
   is what "just a 404" criticism rightly calls out — a prod-ready handler
   keeps the distinction.
4. **The host owns platform context.** Fetch runtimes hand the handler more
   than a `Request` — workerd calls `fetch(request, env, ctx)`, and anything
   binding-backed (a D1 database, KV, secrets) only exists on that `env`.
   The baked bundles stay platform-blind, so today an action that needs a
   binding has no seam to receive it. `createHost` is that seam: the
   returned handler accepts the platform's extra arguments and threads them
   as `ctx.platform` into action execution and loader context, the same way
   `ctx.request` already travels. Node hosts simply have an empty
   `platform`. The alternative — every consumer inventing a `globalThis`
   stash — is a convention where this can be a contract.
