# API Reference

This document provides a comprehensive reference for the Vite React Server Plugin's API.

## Plugin Options

The plugin accepts a configuration object that satisfies the `StreamPluginOptions` type:

```ts
import type { StreamPluginOptions } from "vite-plugin-react-server/server";

export const config = {
  moduleBase: 'src',
  // ... options
} satisfies StreamPluginOptions;
```

### Core Options

| Option | Type | Description | Default |
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
| `htmlWorkerPath` | `string` | Path to custom HTML worker | - |
| `rscWorkerPath` | `string` | Path to custom RSC worker | - |
| `CssCollector` | `React.ComponentType<CssCollectorProps>` | Component for collecting CSS (handles both inline and non-inline modes) | - |
| `build` | `BuildOptions` | Build configuration | - |
| `CSS` | `CssOptions` | CSS handling configuration | - |

### Build Options

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `pages` | `string[]` | Routes to generate | `[]` |
| `dir` | `string` | Base directory | `"dist"` |
| `client` | `string` | Client assets directory | `"client"` |
| `server` | `string` | Server assets directory | `"server"` |
| `static` | `string` | Static output directory | `"static"` |
| `hash` | `string` | Hash for client files | `"hash"` |
| `preserveModulesRoot` | `boolean` | Remove moduleBase from build | `true` |

### CSS Options

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `inlineCss` | `boolean` | Inline CSS in HTML | `false` |
| `purgeCss` | `boolean` | Remove unused CSS | `false` |
| `inlineThreshold` | `number` | Size threshold for inlining (bytes) | `4096` |
| `inlinePatterns` | `RegExp[]` | Patterns for files to always inline | `[/\.module\.css$/]` |
| `linkPatterns` | `RegExp[]` | Patterns for files to always link | `[/node_modules/]` |

## Component Props

### HtmlProps

```ts
interface HtmlProps {
  children: React.ReactNode;
  pageProps: Record<string, any>;
  url: string;
  route: string;
}
```

### CssCollectorProps

```ts
interface CssCollectorProps {
  cssFiles: CssContent[];
  root: string;
  moduleBaseURL: string;
  moduleBasePath: string;
  moduleRootPath: string;
  route: string;
  purgeCss?: boolean;
  children?: React.ReactNode;
}
```

### CssContent

```ts
interface CssContent {
  as: 'link' | 'style'
  id: string;
  children?: string;  // Present when inlineCss is true and size is below the inlineThreshold
}
```

## Worker Messages

### Base Message

```ts
interface BaseMessage {
  type: string;
  id: string;
}
```

### Main Process to Worker Messages

#### ROUTE_READY

```ts
interface RouteReadyMessage extends BaseMessage {
  type: "ROUTE_READY";
  id: string; // Route identifier
}
```

#### RSC_CHUNK

```ts
interface RscChunkMessage extends BaseMessage {
  type: "RSC_CHUNK";
  id: string; // Route identifier
  chunk: string; // RSC content chunk
}
```

#### RSC_END

```ts
interface RscEndMessage extends BaseMessage {
  type: "RSC_END";
  id: string; // Route identifier
}
```

#### CLEANUP

```ts
interface CleanupMessage extends BaseMessage {
  type: "CLEANUP";
  id: string; // Route identifier
}
```

### Html Worker to Main Process Messages

#### HTML_CHUNK

```ts
interface HtmlChunkMessage extends BaseMessage {
  type: "HTML_CHUNK";
  id: string; // Route identifier
  chunk: string; // HTML content chunk
}
```

#### HTML_COMPLETE

```ts
interface HtmlCompleteMessage extends BaseMessage {
  type: "HTML_COMPLETE";
  id: string; // Route identifier
}
```

#### CLEANUP_COMPLETE

```ts
interface CleanupCompleteMessage extends BaseMessage {
  type: "CLEANUP_COMPLETE";
  id: string; // Route identifier
}
```

#### ERROR

```ts
interface ErrorMessage extends BaseMessage {
  type: "ERROR";
  id: string; // Route identifier
  error: string; // Error message
}
```

## Metrics

### StreamMetrics

```ts
interface StreamMetrics {
  chunksReceived: number;
  chunksProcessed: number;
  totalBytes: number;
  startTime: number;
  endTime?: number;
}
```

### RenderMetrics

```ts
interface RenderMetrics {
  htmlSize: number;
  rscSize: number;
  processingTime: number;
  chunks: number;
  chunkRate: number;
}
```

## Plugin Exports

### Client Plugin

```ts
import { vitePluginReactClient } from "vite-plugin-react-server/client";

export default defineConfig({
  plugins: vitePluginReactClient(config),
});
```

### Server Plugin

```ts
import { vitePluginReactServer } from "vite-plugin-react-server";

export default defineConfig({
  plugins: vitePluginReactServer(config) as Plugin[],
});
```

### Static Plugin

```ts
import { reactStaticPlugin } from "vite-plugin-react-server/static";

export default defineConfig({
  plugins: [reactStaticPlugin(config)],
});
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_OPTIONS` | Required for server plugin | `"--conditions react-server"` |
| `NODE_ENV` | Determines worker environment | `"development"` or `"production"` |

## Build Commands

### Client Build

```sh
vite build
```

Outputs files to `dist/static`.

### Server-size client Build

```sh
vite build --ssr
```

Outputs files for server-side execution to `dist/client`.

### Server & Static Build

```sh
NODE_OPTIONS="--conditions react-server" vite build
```

Bundles server-only modules like page's and props to `dist/server`
Generates static HTML and RSC files to `dist/static`.

## Development Commands

### Client Development

```sh
vite
```

Starts the Vite dev server for client-side development.
