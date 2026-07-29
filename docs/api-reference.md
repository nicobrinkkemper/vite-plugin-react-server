# API Reference
This document provides a comprehensive reference for the Vite React Server Plugin's API.

## Plugin Options

The plugin accepts a configuration object that satisfies the `StreamPluginOptions` type:

```ts
import type { StreamPluginOptions } from "vite-plugin-react-server/types";

export const config = {
  moduleBase: 'src',
  // ... options
} satisfies StreamPluginOptions;
```

### Core Options

| Option | Type | Description | Example |
|--------|------|-------------|---------|
| `moduleBase` | `string` | Root directory for project modules | `"src"` |
| `moduleBasePath` | `string` | Second argument to `renderToPipeableStream` | `"/my-repo/"` |
| `moduleBaseURL` | `string` | Requests from this base | `"/my-repo/"` |
| `publicOrigin` | `string` | Origin for moduleBaseURL | `"https://username.github.io"` |
| `Page` | `(url: string) => string` | Maps URLs to page component files | - |
| `props` | `(url: string) => string` | Maps URLs to props files | - |
| `routes` | `RoutesOption` | File-based router (v3+): scans a route tree and derives `Page`, `props`, `routePatterns` and the prerender worklist. Takes `{ dir?, staticPaths? }` or a `fileRouter()` result. See [Routing](./routing.md). | `{ dir: "routes" }` |
| `routePatterns` | `string[]` | Route patterns for param matching (derived by `routes`; state explicitly only without it) | `["/", "/greet/$name"]` |
| `Html` | `React.ComponentType<HtmlProps>` | Wrapper component for production pages | - |
| `pageExportName` | `string` | Name of the page export | `"Page"` |
| `propsExportName` | `string` | Name of the props export | `"props"` |
| `clientEntry` | `string` | Optional explicit client entry. Not needed when `index.html` has a `<script type="module" src>` for the entry — Vite discovers it itself. See [Configuration](./configuration.md#client-entry). | - |
| `htmlWorkerPath` | `string` | Path to custom HTML worker | - |
| `rscWorkerPath` | `string` | Path to custom RSC worker | - |
| `CssCollector` | `React.ComponentType<CssCollectorProps>` | Component for collecting CSS (handles both inline and non-inline modes) | - |
| `build` | `BuildOptions` | Build configuration | - |
| `css` | `CssOptions` | CSS handling configuration | - |
| `verbose` | `boolean` | Enable verbose logging | `true` |
| `rscTimeout` | `number` | Timeout in milliseconds for RSC operations | `5000` |
| `htmlTimeout` | `number` | Timeout in milliseconds for HTML generation operations | `15000` |
| `htmlWorkerStartupTimeout` | `number` | Timeout in milliseconds for HTML worker startup | `5000` |
| `rscWorkerStartupTimeout` | `number` | Timeout in milliseconds for RSC worker startup | `5000` |
| `transport` | `"esm" \| "webpack"` | The deploy's flight flavor; `"webpack"` renders the static snapshots through the baked pair and the dev server serves webpack flight, so every surface agrees (see [Configuration → Transport](./configuration.md#transport)) | `"esm"` |
| `onMetrics` | `OnMetrics` | Callback for build metrics (render, worker-startup, module-resolution, edge-bake, inline-flight and ssg-render metrics) | - |
| `onEvent` | `(event: PluginEvent) => void` | Callback for plugin events | - |
| `normalizer` | `InputNormalizer` | Custom input normalizer | - |
| `moduleID` | `(id: string) => string` | Custom module ID transformer | - |
| `pipeableStreamOptions` | `ReactServerDomEsmOptions` | Options for React's renderToPipeableStream | - |

### Build Options

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `pages` | `string[]` | Routes to generate | `[]` |
| `dir` | `string` | Base directory | `"dist"` |
| `client` | `string` | Client assets directory | `"client"` |
| `server` | `string` | Server assets directory | `"server"` |
| `static` | `string` | Static output directory | `"static"` |
| `hash` | `string` | Hash for client files | `"hash"` |
| `preserveModulesRoot` | `boolean` | When `true`, preserves the `moduleBase` directory (e.g. `src/`) in output paths. When `false`, strips it from output paths. | `false` |
| `assetsDir` | `string` | Assets directory | `"assets"` |
| `api` | `string` | API output directory | `"api"` |
| `outDir` | `string` | Output directory | `"dist"` |
| `rscOutputPath` | `string` | RSC output filename | `"index.rsc"` |
| `htmlOutputPath` | `string` | HTML output filename | `"index.html"` |
| `entryFile` | `(chunk: PreRenderedChunk, ssr: boolean) => string` | Custom entry file naming | - |
| `chunkFile` | `(chunk: PreRenderedChunk, ssr: boolean) => string` | Custom chunk file naming | - |
| `assetFile` | `(asset: PreRenderedAsset, ssr: boolean) => string` | Custom asset file naming | - |
| `extensionMap` | `Record<string, string>` | Custom file extensions | - |
| `moduleExtension` | `string` | Module file extension | `".js"` |
| `jsExtension` | `string` | JavaScript file extension | `".js"` |
| `cssExtension` | `string` | CSS file extension | `".css"` |
| `htmlExtension` | `string` | HTML file extension | `".html"` |
| `jsonExtension` | `string` | JSON file extension | `".json"` |
| `rscExtension` | `string` | RSC file extension | `".rsc"` |
| `cssModuleExtension` | `string` | CSS module file extension | `".css.js"` |
| `nodeExtension` | `string` | Node.js file extension | `".node"` |

### CSS Options

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `inlineCss` | `boolean` | Disable inline CSS in HTML | `true` |
| `inlineThreshold` | `number` | Size threshold for inlining (bytes) | `4096` |
| `inlinePatterns` | `RegExp[]` | Patterns for files to always inline | `[]` |
| `linkPatterns` | `RegExp[]` | Patterns for files to always link | `[]` |

### Loader Options

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `importServerPath` | `string` | Path for server imports | `"vite-plugin-react-server/loader"` |
| `importClientPath` | `string` | Path for client imports | `"vite-plugin-react-server/loader"` |
| `registerClientReferenceName` | `string` | Name for client reference registration | `"registerClientReference"` |
| `registerServerReferenceName` | `string` | Name for server reference registration | `"registerServerReference"` |
| `serverDirective` | `RegExp` | Pattern to match server directives | `/^"use server"$/` |
| `clientDirective` | `RegExp` | Pattern to match client directives | `/^"use client"$/` |
| `directivePattern` | `RegExp` | General pattern for directives | `/^"use (server|client)"$/` |
| `allowedDirectives` | `string[]` | List of allowed directive names | `["use server", "use client"]` |
| `mode` | `"development" \| "production" \| "test"` | Loader mode | `"development"` |
| `isServerFunctionCode` | `(code: string, moduleId?: string) => boolean` | Custom server function detection | - |
| `isClientComponentCode` | `(code: string, moduleId?: string) => boolean` | Custom client-module detection (source + filename) | `detectClientModule` (filename `.client.*` or top-of-file `"use client"`) |
| `isClientComponentByCode` | `(code: string) => boolean` | Custom client-module detection (source only) | `detectClientModule` |
| `isClientComponentByName` | `(moduleId: string) => boolean` | Opt-in escape hatch for name-based client detection. The **default never classifies by name** — only a `"use client"` directive makes a client module. Supply your own predicate if you really want the filename to decide. | always `false` |
| `getDirectiveType` | `(directive: string, moduleId?: string) => "client" \| "server" \| undefined` | Custom directive type detection | - |

### Auto-Discovery Options

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `cssPattern` | `RegExp \| string` | Pattern to match CSS files | `/\.css$/` |
| `cssModulePattern` | `RegExp \| string` | Pattern to match CSS module files | `/\.css\.js$/` |
| `clientPattern` | `RegExp \| string` | Filenames that follow the client-module naming convention (`*.client.tsx`). Only the `"use client"` directive makes a module a client module; this pattern is a lint — a matching first-party file without the directive gets a build warning to add one. | `/(^\|[\/.])client\.[cm]?[jt]sx?$/` |
| `serverPattern` | `RegExp \| string` | Pattern to match server function files | `/\.server\.(js\|ts\|jsx\|tsx)$/` |
| `htmlPattern` | `RegExp \| string` | Pattern to match HTML files | `/\.html$/` |
| `jsonPattern` | `RegExp \| string` | Pattern to match JSON files | `/\.json$/` |
| `modulePattern` | `RegExp \| string` | Pattern to match module files | `/\.(js\|ts\|jsx\|tsx)$/` |
| `rscPattern` | `RegExp \| string` | Pattern to match RSC files | `/\.rsc$/` |
| `pagePattern` | `RegExp \| string` | Pattern to match page files | `/[Pp]age\.(js\|ts\|jsx\|tsx)$/` |
| `propsPattern` | `RegExp \| string` | Pattern to match props files | `/[Pp]rops\.(js\|ts\|jsx\|tsx)$/` |
| `dotPattern` | `RegExp \| string` | Pattern to match dot files | `/^\.[^/]+$/` |
| `nodePattern` | `RegExp \| string` | Pattern to match Node.js native modules | `/\.node$/` |
| `vendorPattern` | `RegExp \| string` | Pattern to match vendor files | `/node_modules\|_virtual/` |
| `virtualPattern` | `RegExp \| string` | Pattern to match virtual files | `/^virtual:/` |

## Component Props

### HtmlProps

Props passed to the Html wrapper component during static generation:

```typescript
type HtmlProps = {
  pageProps?: any;
  Page: PageComponentType;
  route: string;
  url: string;
  projectRoot: string;
  moduleBase: string;
  moduleBaseURL: string;
  moduleBasePath: string;
  moduleRootPath: string;
  cssFiles: Map<string, CssContent>;
  manifest: Manifest;
  Root: RootComponentType | typeof React.Fragment;
  globalCss: Map<string, CssContent>;
  as?: keyof JSX.IntrinsicElements;
};
```

### RootProps

Props for the Root component that wraps page content:

```typescript
type RootProps = {
  as: keyof JSX.IntrinsicElements;
  cssFiles?: Map<string, CssContent>;
  pageProps?: any;
  Page: PageComponentType;
  id?: string;
};
```

### CssContent

CSS content can be either inline (string) or linked (object with href):

```typescript
type CssContent<InlineCSS extends boolean = boolean> = 
  InlineCSS extends true ? string : { href: string };
```

## Build Configuration

### BuildConfig

Configuration for build processes:

```typescript
interface BuildConfig {
  pages: string[];
  client?: string; // Default: "client"
  server?: string; // Default: "server"
  static?: string; // Default: "static"
  outDir?: string; // Default: "dist"
  assetsDir?: string; // Default: "assets"
  rscOutputPath?: string; // Default: "index.rsc"
  htmlOutputPath?: string; // Default: "index.html"
  preserveModulesRoot?: boolean;
  hash?: string;
  edge?: EdgeBuildConfig;
}
```

### `build.edge`

Single-isolate edge bundle (additive; **ON by default**). See [Edge / Single-Isolate](./edge.md).

```typescript
// build.edge?: boolean | EdgeBuildConfig   (default: true)
//   true / omitted  → emit with defaults
//   false           → opt out
//   { … }           → emit, with overrides
interface EdgeBuildConfig {
  outDir?: string;  // Default: "server-edge" (under build.outDir)
  minify?: boolean; // Default: true — edge runtimes cap bundle size
}
```

Drive the baked `render.js` with `createEdgeHandler` from
`vite-plugin-react-server/stream`: `renderRouteToDocument` for a flash-free
inline-flight document, `handleRouteAction` for the baked server-action gate, or
the low-level `renderRouteToFlight` producer.

### CssConfig

Configuration for CSS handling:

```typescript
interface CssConfig {
  inlineCss?: boolean; // Default: undefined = auto (inline files <= inlineThreshold); false disables inlining
  inlineThreshold?: number; // Default: 4096 (4KB)
  inlinePatterns?: RegExp[];
  linkPatterns?: RegExp[];
}
```

### preserveModulesRoot Behavior

The `build.preserveModulesRoot` option controls how the `moduleBase` directory appears in build output paths:

#### When `preserveModulesRoot: true` (preserve paths)
- **Input:** `src/page/home.tsx`
- **Output:** `dist/client/src/page/home.js`
- **Behavior:** The `src/` directory is **preserved** in the output path

#### When `preserveModulesRoot: false` (strip paths - default)
- **Input:** `src/page/home.tsx`  
- **Output:** `dist/client/page/home.js`
- **Behavior:** The `src/` directory is **removed** from the output path

This option is useful when you want to maintain your source directory structure in the build output, especially for debugging or when integrating with tools that expect specific path structures.

## Event System

### PluginEvent

Events emitted during build processes:

```typescript
type PluginEvent = 
  | { type: 'build:start'; data: { target: string } }
  | { type: 'build:end'; data: { target: string; duration: number } }
  | { type: 'page:build:start'; data: { url: string; target: string } }
  | { type: 'page:build:end'; data: { url: string; target: string; duration: number } }
  | { type: 'error'; data: { message: string; stack?: string } }
  | { type: 'warning'; data: { message: string } };
```

### BuildMetrics

Metrics collected during builds:

```typescript
interface BuildMetrics {
  buildTime: number;
  htmlSize: number;
  rscSize: number;
  cssSize: number;
  jsSize: number;
  pageCount: number;
  errorCount: number;
  warningCount: number;
}
```

## Worker Messages

### WorkerMessage

Messages sent between main thread and workers:

```typescript
type WorkerMessage = 
  | { type: 'render'; data: RenderRequest }
  | { type: 'result'; data: RenderResult }
  | { type: 'error'; data: { message: string; stack?: string } }
  | { type: 'ready'; data: {} };
```

### RenderRequest

Request structure for rendering:

```typescript
interface RenderRequest {
  url: string;
  pageProps?: any;
  moduleBaseURL: string;
  cssFiles: CssFile[];
  globalCss: CssFile[];
}
```

### RenderResult

Result structure from rendering:

```typescript
interface RenderResult {
  html: string;
  rsc: string;
  css: string;
  duration: number;
}
```

## Type Definitions

### Component Types

```typescript
// Page component — receives page props, returns React element
type PageComponentType = (props: any) => React.ReactNode;

// Root component — wraps page with CSS and layout
type RootComponentType = (props: RootProps) => React.ReactNode;

// Html component — outer HTML shell for static generation
type HtmlComponentType = (props: HtmlProps) => React.ReactNode;

// CSS component — renders inline <style> or <link> tags
type CssComponentType = (props: CssProps) => React.ReactNode;
```

> **Note:** The full type signatures use generics constrained by a `ViteReactServerComponentsPlugin` interface for advanced type customization. The simplified versions above cover most use cases. See `plugin/types.ts` for the full generic signatures.

### Environment Detection

```typescript
// Check current execution context
function getCondition(): string | null;

// Environment-specific configurations
const RSC_LOADER = {
  development: {
    importServerPath: "react-server-dom-esm/server.node",
    importClientPath: "react-server-dom-esm/server.node",
    registerClientReferenceName: "registerClientReference",
    registerServerReferenceName: "registerServerReference"
  },
  production: {
    importServerPath: "react-server-dom-esm/server",
    importClientPath: "react-server-dom-esm/server",
    registerClientReferenceName: "registerClientReference",
    registerServerReferenceName: "registerServerReference"
  }
};
```

## Directive Patterns

### Server Directives

```typescript
const SERVER_DIRECTIVE = /^["']use server["'];?\s*$/gm;
```

### Client Directives

```typescript
const CLIENT_DIRECTIVE = /^["']use client["'];?\s*$/gm;
```

### Validation Rules

```typescript
const DIRECTIVE_CONFIGS = {
  client: {
    functionLevel: false,
    target: 'client',
    validate: (params) => params.index === 0, // Must be at file start
    warning: "'use client' directive is only allowed at the top of a file"
  },
  server: {
    functionLevel: true,
    target: 'server',
    validate: (params) => {
      const before = params.code.slice(0, params.index).trim();
      return before === '' || before.endsWith('\n');
    },
    warning: "File-level directives must be at the top of the file, before any other code"
  }
};
```

## File Patterns

### Auto-Discovery Patterns

```typescript
const AUTO_DISCOVER = {
  modulePattern: /\.(m|c)?(j|t)sx?$/,
  serverPattern: /(?:\.\/)?server(?:\.(m|c)?(j|t)sx?)?$/,
  clientPattern: /(^|[\/.])client\.[cm]?[jt]sx?$/,
  pagePattern: /(?:\.\/)?page(?:\.(m|c)?(j|t)sx?)?$/,
  propsPattern: /(?:\.\/)?props(?:\.(m|c)?(j|t)sx?)?$/,
  cssPattern: /\.css$/,
  jsonPattern: /\.json$/,
  htmlPattern: /\.html$/,
  rscPattern: /\.rsc$/,
};
```

A file is a client module when its source starts with a top-of-file `"use client"` directive. That is the only mechanism.

`clientPattern` is a lint, not a classifier: a first-party file whose name
matches but has no directive gets a build warning to add one. The warning
exists because filename conventions don't travel — every React toolchain honors
the directive, none honor a name — so a file relying on its name alone would
render as a server module anywhere else.

### Extension Mapping

```typescript
const EXTENSION_MAP = {
  ".js": ".js",
  ".ts": ".js",
  ".jsx": ".js",
  ".tsx": ".js",
  ".css": ".css",
  ".json": ".json",
  ".html": ".html",
  ".rsc": ".rsc",
  ".client": ".client.js",
  ".server": ".server.js",
};
```

## Testing Utilities

### doBuild Function

```typescript
function doBuild(options: {
  projectRoot: string;
  build: BuildConfig;
  verbose?: boolean;
}): Promise<PluginEvent[]>;
```

### Test Configuration

```typescript
const testConfig: StreamPluginOptions = {
  moduleBase: "src",
  Page: (url) => `src/page.tsx`,
  build: { pages: ["/"] },
  verbose: true,
  onEvent: (event) => console.log(event),
  onMetrics: (metrics) => console.log(metrics),
};
```

## Import Paths

### Main Plugin

```typescript
import { vitePluginReactServer } from "vite-plugin-react-server";
```

### Client Plugin

```typescript
import { vitePluginReactClient } from "vite-plugin-react-server/client";
```

### Server Plugin

```typescript
import { vitePluginReactServer } from "vite-plugin-react-server/server";
```

### Router (config side)

```typescript
// Condition-neutral: fileRouter builds the router table (used in vite.config),
// withParams wraps a loader, matchRoutes/fillPattern are the pattern helpers.
import { fileRouter, withParams, matchRoutes, fillPattern } from "vite-plugin-react-server/router";
```

### Router (client runtime)

```typescript
// "use client" side: startClient wires router + hydration + HMR in one call.
import { startClient, Link, useParams, useLocation, useRouter, RouterProvider, createRouter } from "vite-plugin-react-server/router/client";
```

See [Routing](./routing.md) for the full guide.

### Stream Helpers

```typescript
import { createRscStream, createHtmlStream, handleRscStream } from "vite-plugin-react-server/stream";
```

### Utils (Conditional Export)

```typescript
// Default condition (client) — includes createReactFetcher, setupRscHmr, useRscHmr
import { createReactFetcher, setupRscHmr, useRscHmr, callServer } from "vite-plugin-react-server/utils";

// react-server condition — excludes browser-only modules
import { callServer, env, routeToURL } from "vite-plugin-react-server/utils";
```

For consumers who want to import only the pure helpers (urls, env, routeToURL) without dragging in the optional `react-server-dom-esm` peer that the RSC-client helpers require, the RSC-client helpers are also available behind their own subpath:

```typescript
// Opt-in subpath for RSC-client helpers — explicitly requires the
// `react-server-dom-esm` peer to be resolvable (the vprs Vite plugin
// sets this up automatically for RSC apps).
import { createReactFetcher, setupRscHmr, useRscHmr, callServer } from "vite-plugin-react-server/utils/rsc-client";
```

#### Cancelling a superseded RSC fetch

`createReactFetcher` accepts an `AbortSignal`. Without one, a flight fetch
that gets superseded — a fast double-navigation, a refetch racing an earlier
fetch — aborts mid-body and the decoder's `TypeError: Error in input stream`
lands in the nearest error boundary, briefly flashing an error card for a
stream nobody is waiting on anymore.

Have each navigation/refetch own an `AbortController`, and abort the previous
one before starting the next. A stream cancelled through its signal never
rejects — the stale thenable stays pending (React keeps the current UI) until
the replacing fetch resolves:

```tsx
let controller: AbortController | undefined;

function navigate(url: string) {
  controller?.abort();          // cancel the in-flight stream, silently
  controller = new AbortController();
  setContent(createReactFetcher({ url, signal: controller.signal }));
}
```

Genuine flight failures (network errors, decode failures on a stream that was
NOT aborted) still reject and reach the error boundary as before.

### Storybook preset

A Storybook preset that makes a vprs app build and render in Storybook. Referenced as an addon, not imported directly. See [Storybook](./storybook.md).

```ts
// .storybook/main.ts
export default { addons: ["vite-plugin-react-server/storybook"] };
```

### react-server-dom-esm transport

The `react-server-dom-esm` transport ships in the
[`react-server-loader`](https://www.npmjs.com/package/react-server-loader)
dependency, which exposes it under public subpaths so non-plugin consumers (e.g.
the Storybook preset) can resolve it. Not typically imported by app code.

```typescript
// ESM client.browser build (dev/prod conditioned)
import "react-server-loader/client.browser";
```

> In vprs 1.x this was re-hosted under `vite-plugin-react-server/react-server-dom-esm/*`.
> That self-export was removed in 2.0 — import from `react-server-loader` instead.

### Type Imports

```typescript
import type { 
  StreamPluginOptions,
  HtmlProps,
  RootProps,
  BuildConfig,
  PluginEvent,
  BuildMetrics
} from "vite-plugin-react-server/types";
```

### Component Imports

```typescript
import { Css } from "vite-plugin-react-server/components";
```

### Configuration Utilities

```typescript
import { getCondition } from "vite-plugin-react-server/config";
```

## Metric Watcher

`metricWatcher` renders the plugin's metrics stream as readable build output.
It is **opt-in**: without an `onMetrics` callback the build prints only its raw
summary lines. Wire the watcher in and those summaries are replaced by richer,
per-route output:

```ts
import { metricWatcher } from "vite-plugin-react-server/metrics";

export const config = {
  moduleBase: "src",
  onMetrics: metricWatcher(),
};
```

A healthy static build then reads like this (a 300-page consumer build):

```
HTML-worker started in 154ms (initial route: /)
cold module load 211ms (mainThread, first route: /10mmc/credits)
— warm-up: 1 route in 317ms (cold module load paid here) —
dist/static/10mmc/credits/index.{rsc,html} 20.4 kB+21.8 kB 317ms (modules 211ms + route 106ms)
— batch 1: 8 routes in 150ms wall (sum 1.11s, 7.4× parallel) —
…
rendered 300 pages in 5.51s (54.4 pages/s)
inlined flight into 300 page(s) in 350ms
baked edge producer in 796ms → dist/server-edge
```

Reading it: the first route renders solo as a **warm-up** and pays the one-time
cold module load; every later batch renders full-width against the warm graph,
and its overview line shows wall time vs summed per-route time (the parallel
factor). Each route gets one consolidated line — the flight (`.rsc`) and the
document (`.html`) share a clock and complete together (the html render
consumes the flight as it streams); a `(+Nms html)` suffix appears only when
the document genuinely trailed the flight. A `(modules X + route Y)` split
separates a route's own module-load cost from its render time.

Warnings are reserved for anomalies: renders slower than `maxTime` after
cold-start attribution, stream backpressure past `maxBackpressure`, and module
resolutions that were all cache-hit waiting.

### Metric Watcher Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxTime` | `number` | `200` | Slow-render / slow-resolution warning threshold (ms) |
| `maxBackpressure` | `number` | `1` | Backpressure occurrences tolerated before warning |
| `warnOnly` | `boolean` | `false` | Only warnings — suppress all info output |
| `warn` | `function` | `console.warn` | Custom warning sink |
| `info` | `function` | `console.info` | Custom info sink |

### Metric types

`onMetrics` receives a union (see `OnMetrics` in the exported types); a custom
callback can switch on `metrics.type`:

| `type` | When | Notable fields |
|--------|------|----------------|
| `"rsc-full"` / `"rsc-headless"` / `"html"` | per route render | `processingTime`, `fileSize`, `streamMetrics`, `batch` |
| `"worker-startup"` | once per worker | `workerType`, `startupTime` |
| `"module-resolution"` | per route load phase | `resolutionTime`, `resolveStartAt`, `moduleRunAt`, `moduleRunTime` |
| `"ssg-render"` | once per build | `pages`, `failed`, `renderTime` |
| `"inline-flight"` | after the post-write inline pass | `pages`, `inlineTime` |
| `"edge-bake"` | per edge-bake half | `kind` (`producer`/`consumer`), `outputPath`, `bakeTime` |

The watcher ignores metric types it doesn't know, so a newer plugin with an
older consumer-pinned watcher degrades gracefully.

### Backpressure Monitoring

The metric watcher automatically monitors stream backpressure, which occurs when:
- The file writer is slower than the HTML generation
- The worker communication queue is full
- System resources are constrained

Backpressure warnings help identify performance bottlenecks and potential memory issues.
