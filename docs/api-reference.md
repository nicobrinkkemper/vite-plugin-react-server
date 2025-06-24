# API Reference

This document provides a complete reference for the Vite React Server Plugin API.

## Plugin Configuration

### StreamPluginOptions

The main configuration interface for the plugin:

```typescript
interface StreamPluginOptions<
  PageProps = any,
  InlineCSS extends boolean = boolean,
  As extends keyof JSX.IntrinsicElements = "div",
  ReactType = any
> {
  // Required options
  moduleBase: string;
  Page: (url: string) => string;
  
  // Optional configurations
  props?: (url: string) => string;
  Html?: React.ComponentType<HtmlProps<PageProps, InlineCSS, As, ReactType>>;
  CssCollector?: CssCollectorFn<As, InlineCSS, PageProps, ReactType>;
  build?: BuildConfig;
  css?: CssConfig;
  
  // Monitoring and debugging
  verbose?: boolean;
  onEvent?: (event: PluginEvent) => void;
  onMetrics?: (metrics: BuildMetrics) => void;
  
  // Timeouts (in milliseconds)
  rscTimeout?: number; // Default: 5000
  htmlWorkerStartupTimeout?: number; // Default: 3000
  rscWorkerStartupTimeout?: number; // Default: 3000
  
  // Advanced options
  moduleBaseExceptions?: string[];
  reactDirectives?: Set<string>;
  devPort?: number; // Default: 5173
  previewPort?: number; // Default: 4173
  devHost?: string; // Default: "localhost"
  previewHost?: string; // Default: "localhost"
}
```

### Default Values

```typescript
const DEFAULT_CONFIG = {
  RSC_TIMEOUT: 5000, // 5 seconds
  HTML_WORKER_STARTUP_TIMEOUT: 3000, // 3 seconds
  RSC_WORKER_STARTUP_TIMEOUT: 3000, // 3 seconds
  DEV_PORT: 5173,
  PREVIEW_PORT: 4173,
  DEV_HOST: "localhost",
  PREVIEW_HOST: "localhost",
  VERBOSE: false,
  REACT_DIRECTIVES: new Set(["use client", "use server"]),
  CSS: {
    inlineCss: false,
    purgeCss: false,
    inlineThreshold: 4096, // 4KB
    inlinePatterns: [],
    linkPatterns: [],
  },
  BUILD: {
    pages: [],
    client: "client",
    server: "server",
    static: "static",
    outDir: "dist",
    assetsDir: "assets",
    rscOutputPath: "index.rsc",
    htmlOutputPath: "index.html",
  }
};
```

## Component Props

### HtmlProps

Props passed to the Html component:

```typescript
interface HtmlProps<
  PageProps = any,
  InlineCSS extends boolean = boolean,
  As extends keyof JSX.IntrinsicElements = "div",
  ReactType = any
> {
  children: ReactType;
  CssCollector: CssCollectorFn<As, InlineCSS, PageProps, ReactType>;
  cssFiles: CssFile[];
  globalCss: CssFile[];
  pageProps: PageProps;
  Page: PageComponentType<PageProps, ReactType>;
  moduleBaseURL: string;
}
```

### CssCollectorProps

Props for CSS collector components:

```typescript
interface CssCollectorProps<
  As extends keyof JSX.IntrinsicElements = "div",
  InlineCSS extends boolean = boolean,
  PageProps = any,
  ReactType = any
> {
  as?: As;
  cssFiles: CssFile[];
  Page?: PageComponentType<PageProps, ReactType>;
  pageProps?: PageProps;
  children?: ReactType;
}
```

### CssFile

Structure for CSS file references:

```typescript
interface CssFile {
  href: string;
  content?: string;
  inline?: boolean;
  media?: string;
  rel?: string;
}
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
  preserveDirectives?: boolean;
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

### Generic Types

The plugin uses generic types to maintain compatibility across React versions:

```typescript
// Generic function type that adapts to any React version
type CssCollectorFn<
  As extends keyof JSX.IntrinsicElements = "div",
  InlineCSS extends boolean = boolean,
  PageProps = any,
  ReactType = any
> = (props: CssCollectorProps<As, InlineCSS, PageProps, ReactType>) => ReactType;

// Generic page component type
type PageComponentType<PageProps = any, ReactType = any> = 
  (props: PageProps) => ReactType;
```

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
  clientPattern: /(?:\.\/)?client(?:\.(m|c)?(j|t)sx?)?$/,
  pagePattern: /(?:\.\/)?page(?:\.(m|c)?(j|t)sx?)?$/,
  propsPattern: /(?:\.\/)?props(?:\.(m|c)?(j|t)sx?)?$/,
  cssPattern: /\.css$/,
  jsonPattern: /\.json$/,
  htmlPattern: /\.html$/,
  rscPattern: /\.rsc$/,
};
```

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

### Client-Only Plugin

```typescript
import { vitePluginReactServer } from "vite-plugin-react-server/client";
```

### Server-Only Plugin

```typescript
import { vitePluginReactServer } from "vite-plugin-react-server/server";
```

### Type Imports

```typescript
import type { 
  StreamPluginOptions,
  HtmlProps,
  CssCollectorProps,
  BuildConfig,
  PluginEvent,
  BuildMetrics
} from "vite-plugin-react-server/types";
```

### Component Imports

```typescript
import { CssCollectorElements } from "vite-plugin-react-server/components";
```

### Configuration Utilities

```typescript
import { getCondition } from "vite-plugin-react-server/config";
```
