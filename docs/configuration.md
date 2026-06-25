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

      // Optional — single-isolate edge bundle (additive; default off).
      // See docs/edge.md.
      edge: {
        singleIsolate: false,          // emit dist/server-edge/render.js
        outDir: "server-edge",         // under build.dir
        minify: true,                  // edge runtimes enforce size limits
      },
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
    "build": "NODE_OPTIONS='--conditions react-server' vite build --app",
    "preview": "vite preview"
  }
}
```

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

## Metric Watcher

```ts
import { metricWatcher } from "vite-plugin-react-server/metrics";

vitePluginReactServer({
  onMetrics: metricWatcher({
    maxTime: 200,          // warn if > 200ms
    maxBackpressure: 0,    // warn on any backpressure
  }),
});
```
