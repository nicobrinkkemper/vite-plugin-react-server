# Configuration

```ts
import { defineConfig } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";

export default defineConfig({
  plugins: vitePluginReactServer({
    // Required
    moduleBase: "src",
    Page: "src/page.tsx",              // string or (url: string) => string
    build: { pages: ["/"] },

    // Optional — file-based routing (replaces Page/props/build.pages, see below)
    routes: { dir: "routes" },         // scans src/routes/** — see docs/routing.md

    // Optional — component resolution
    props: "src/props.ts",             // string or (url: string) => string
    Html: "src/Html.tsx",              // string — HTML shell component
    Root: "src/Root.tsx",              // string — root wrapper component
    pageExportName: "Page",            // named export to use from Page file
    propsExportName: "props",          // named export to use from props file
    clientEntry: "src/client.tsx",     // optional — see "Client entry" below

    // Optional — direct component references (react-server condition only)
    components: {
      Page: MyPage,
      Html: MyHtml,
      Root: MyRoot,
    },

    // Optional — URL handling
    moduleBasePath: "",                // second arg to renderToPipeableStream
    moduleBaseURL: "/",                // URL prefix for modules (default: VITE_BASE_URL || "/")
    publicOrigin: "",                  // static replacement for location.origin

    // Optional — CSS
    css: {
      inlineCss: true,                 // inline small CSS files (default: true)
      inlineThreshold: 4096,           // size threshold in bytes
      inlinePatterns: [],              // RegExp[] — always inline these
      linkPatterns: [],                // RegExp[] — always link these
    },

    // Optional — build
    build: {
      pages: ["/"],
      dir: "dist",
      client: "client",
      server: "server",
      static: "static",
      hash: "hash",
      preserveModulesRoot: false,      // keep src/ in output paths
      renderMode: "parallel",          // "parallel" | "sequential"
      batchSize: 8,                    // pages per batch in parallel mode
      rscOutputPath: "index.rsc",
      htmlOutputPath: "index.html",
      // Inline each prerendered route's flight into its index.html so first
      // paint hydrates with no index.rsc round-trip. See docs/build-output.md.
      inlineFlight: false,

      // Optional — single-isolate edge bundle (additive; ON by default).
      // `boolean | { outDir?, minify?, transport? }`. See docs/edge.md.
      //   edge: false             — opt out
      //   edge: { minify: false } — keep on, tune a default
      //   transport: "esm" (default, import-at-request-time client refs) or
      //   "webpack" (baked client manifest — the self-contained deploy model);
      //   defaults from the top-level `transport` option when set.
      edge: true,
    },

    // Optional — workers
    htmlWorkerPath: "./custom-html-worker.js",
    rscWorkerPath: "./custom-rsc-worker.js",
    rscTimeout: 5000,
    htmlTimeout: 15000,
    htmlWorkerStartupTimeout: 5000,
    rscWorkerStartupTimeout: 5000,

    // Optional — dev
    dev: {
      useRscWorker: false,             // use worker in dev mode (default: false)
    },

    // Optional — observability
    verbose: true,
    onMetrics: (metrics) => console.log(metrics),
    onEvent: (event) => console.log(event),
  }),
});
```

## File-based routing (`routes`)

`routes` turns on the file-based router (v3+): the file tree under the routes
directory becomes the URL tree, and vprs derives `Page`, `props`,
`routePatterns` and the prerender worklist from it — you don't restate them.

```ts
routes: {
  dir: "routes",                       // relative to moduleBase; omit to scan moduleBase itself
  staticPaths: {                       // vprs's getStaticPaths, per dynamic route
    "/greet/$name": () => [{ name: "ada" }, { name: "grace" }],
  },
},
```

It also accepts an already-built router table — a `fileRouter()` result or a
hand-rolled equivalent. Explicit `Page` / `props` / `routePatterns` /
`build.pages` still win over what the router derives. Full guide:
[Routing](./routing.md).

## Component Resolution

The plugin resolves components in this order:

1. **`components.*`** — direct references (highest priority, react-server only)
2. **Path strings/functions** — `Page`, `Html`, `Root`, `props`
3. **Plugin defaults** — fallback

### Path-based (recommended)

Works in both dev modes. Supports HMR and per-route components.

```ts
Page: (url) => `src/pages${url}page.tsx`,
props: (url) => `src/pages${url}props.ts`,
Html: "src/Html.tsx",
```

### Direct references

Faster builds, no file resolution. Only works when the main thread has the `react-server` condition.

```ts
import { MyHtml } from "./src/Html.js";

components: { Html: MyHtml },
```

## Client entry

For the conventional setup — an `index.html` with `<script type="module" src="/src/client.tsx">` (or similar) — you do **not** need to set `clientEntry`. vprs leaves that file to Vite's own entry-point discovery and won't add it as a duplicate input, even if the file carries a `"use client"` directive.

Set `clientEntry` only when the client entry isn't referenced from `index.html` and needs to be picked up another way.

## Dev Modes

| Mode | Command | RSC runs on | Benefits |
|------|---------|-------------|----------|
| SSR | `vite` | Worker thread | Default, better isolation |
| RSC | `NODE_OPTIONS='--conditions react-server' vite` | Main thread | Easier debugging, React in config |

Both produce identical output. The RSC worker is skipped in `dev:rsc` mode by default — Vite's environment runner handles HMR directly.

## Build Scripts

```json
{
  "scripts": {
    "dev": "vite",
    "dev:rsc": "NODE_OPTIONS='--conditions react-server' vite",
    "build": "vite build --app",
    "preview": "vite preview"
  }
}
```

`--conditions react-server` is optional everywhere, never required: with it the
main thread renders RSC directly (a bit faster, better stack traces); without
it a worker thread carries the react-server condition and the output is
identical. `dev:rsc` above is that optional variant for dev; add
`NODE_OPTIONS='--conditions react-server'` to `build` too if you want the same
for builds.

## Third-party `"use client"` packages

Libraries like Chakra UI, MUI, Mantine, react-aria, and framer-motion ship per-file `"use client"` directives in their compiled output. vprs picks them up automatically so they can be imported directly in server components — same as Next.js's App Router.

Detection runs once at config-time via [`vitefu.crawlFrameworkPkgs`](https://github.com/svitejs/vitefu): any package with `react` in `peerDependencies` is added to the bundle's `noExternal` list, has its directives preserved through esbuild's pre-bundle (`optimizeDeps.exclude`), and gets each `"use client"` module emitted as its own client chunk so the html-worker can resolve client references at SSG render time.

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `clientPackages` | `readonly string[]` | `[]` | Manual additions, merged with auto-detected. Use for packages that don't list `react` in peerDeps but should be treated as client-packages anyway. |
| `excludeClientPackages` | `readonly string[]` | `[]` | Skip auto-detected packages. Common case: dev-only Storybook deps that aren't part of the prod import graph. |

```ts
vitePluginReactServer({
  // ... other options ...
  clientPackages: ["@my-org/internal-ui"],
  excludeClientPackages: [
    "@storybook/react",
    "@storybook/react-vite",
    "@storybook/react-dom-shim",
  ],
});
```

If detection fails (missing lockfile, monorepo edge), the build continues with whatever's in `clientPackages` — and emits a warning if `verbose: true`.

## `preserveModulesRoot`

Controls whether `moduleBase` (e.g. `src/`) appears in output paths:

| Value | Input | Output |
|-------|-------|--------|
| `false` (default) | `src/page/home.tsx` | `dist/client/page/home.js` |
| `true` | `src/page/home.tsx` | `dist/client/src/page/home.js` |

## App Mode (`--app`)

When using `vite build --app`, the plugin builds all environments in sequence. Add the `buildApp` hook to ensure correct ordering:

```ts
export default defineConfig({
  plugins: [vitePluginReactServer(options)],
  builder: {
    buildApp: async (builder) => {
      for (const env of Object.values(builder.environments)) {
        if (!env.isBuilt) await builder.build(env);
      }
    },
  },
});
```

## Transport

The deploy's RSC flight flavor. Default `"esm"` — module references are URLs
the browser imports directly; the best DX for static sites with no
per-request rendering.

```ts
vitePluginReactServer({
  transport: "webpack",
});
```

With `"webpack"` the whole deploy carries one flavor, and every artifact
renders once, in that flavor: the option defaults the edge bake to the
webpack pair, and the enumerated routes' `index.html`/`index.rsc` snapshots
render **through that pair** — the same producer + consumer a deployed
handler runs — instead of through the esm SSG pass. One deploy may then
serve any route from the CDN or the per-request handler interchangeably; the
browser client, the inline flight, and the fetched `.rsc` payloads all
agree. Build events and metrics are unchanged: the pair render owns the same
`build.ssg.*`/`file.write` events and `ssg-render` summary the esm pass
emits.

The dev server follows the option too: with `"webpack"` it renders
webpack-flavored flight and the browser decodes it live — dev and production
run the same transport, no parity caveats.

Do not hand-mix flavors instead: an esm-hydrated document cannot decode a
webpack `.rsc` (and vice versa), so serving both to one client breaks
navigation between them. Per-surface splits are fine only when a single
surface actually serves a given deploy — which is exactly what this option
exists to make unnecessary.

The option is a plain value, so per-mode policy is ordinary JavaScript:

```ts
vitePluginReactServer({
  transport: process.env.NODE_ENV === "production" ? "webpack" : "esm",
});
```

Dev and production are separate sessions — each is internally coherent — so
choosing a flavor per mode is safe in a way per-route mixing within one
deploy never is.

The [vprs-starter](https://github.com/nicobrinkkemper/vprs-starter) is the
living example: one `transport: "webpack"` line, and its Vercel deploy serves
`/about` from CDN snapshots while `/` renders per request — with client-side
navigation across that boundary, which is precisely what one flavor buys.

## Metric Watcher

Opt-in build output: wire `metricWatcher` into `onMetrics` and the build prints
per-route lines, batch overviews and cold-start attribution instead of the raw
summaries. See [API Reference → Metric Watcher](./api-reference.md#metric-watcher)
for the output format and options.

```ts
import { metricWatcher } from "vite-plugin-react-server/metrics";

vitePluginReactServer({
  onMetrics: metricWatcher(),
});
```
