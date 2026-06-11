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
| `onMetrics` | `(metrics: RenderMetrics) => void` | Callback for build metrics | - |
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
| `isClientComponentByName` | `(moduleId: string) => boolean` | Custom client-module detection (filename only) | `detectClientModule`; a custom `autoDiscover.clientPattern` takes precedence |
| `getDirectiveType` | `(directive: string, moduleId?: string) => "client" \| "server" \| undefined` | Custom directive type detection | - |

### Auto-Discovery Options

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `cssPattern` | `RegExp \| string` | Pattern to match CSS files | `/\.css$/` |
| `cssModulePattern` | `RegExp \| string` | Pattern to match CSS module files | `/\.css\.js$/` |
| `clientPattern` | `RegExp \| string` | Pattern to match client-module filenames. Anchored so substrings like `clientUtils.tsx` are not matched; the standalone basename `client.tsx` matches alongside the dotted-suffix form `Foo.client.tsx`. A top-of-file `"use client"` directive is recognised independently. | `/(^\|[\/.])client\.[cm]?[jt]sx?$/` |
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
}
```

### CssConfig

Configuration for CSS handling:

```typescript
interface CssConfig {
  inlineCss?: boolean; // Default: false
  purgeCss?: boolean; // Default: false
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

A file is treated as a client module when **either** the filename matches `clientPattern` **or** the source starts with a top-of-file `"use client"` directive. Both mechanisms are first-class — neither is a fallback to the other.

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

The plugin includes a built-in metric watcher that monitors build performance and backpressure:

```ts
import { metricWatcher } from "vite-plugin-react-server/metrics";

// Default configuration (enabled by default)
const defaultWatcher = metricWatcher({
  maxTime: 200,        // Warn if processing takes > 200ms
  maxBackpressure: 0,  // Warn if any backpressure occurs
});

// Custom configuration
const customWatcher = metricWatcher({
  maxTime: 500,           // Warn if processing takes > 500ms
  maxBackpressure: 5,     // Warn if > 5 backpressure occurrences
  warnOnly: true,         // Only show warnings, not info messages
});
// or simply
export const config = {
  moduleBase: "src",
  onMetrics: metricWatcher()
}
```

### Metric Watcher Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxTime` | `number` | `200` | Maximum processing time in milliseconds before warning |
| `maxBackpressure` | `number` | `0` | Maximum backpressure occurrences before warning |
| `warnOnly` | `boolean` | `false` | Only show warnings, suppress info messages |
| `warn` | `function` | `console.warn` | Custom warning function |
| `info` | `function` | `console.info` | Custom info function |

### Backpressure Monitoring

The metric watcher automatically monitors stream backpressure, which occurs when:
- The file writer is slower than the HTML generation
- The worker communication queue is full
- System resources are constrained

Backpressure warnings help identify performance bottlenecks and potential memory issues.
