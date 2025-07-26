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
| `isClientComponentCode` | `(code: string, moduleId?: string) => boolean` | Custom client component detection | - |
| `getDirectiveType` | `(directive: string, moduleId?: string) => "client" \| "server" \| undefined` | Custom directive type detection | - |

### Auto-Discovery Options

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `cssPattern` | `RegExp \| string` | Pattern to match CSS files | `/\.css$/` |
| `cssModulePattern` | `RegExp \| string` | Pattern to match CSS module files | `/\.css\.js$/` |
| `clientPattern` | `RegExp \| string` | Pattern to match client component files | `/\.client\.(js\|ts\|jsx\|tsx)$/` |
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

Props passed to the Html component:

```typescript
interface HtmlProps<
  PageProps = any,
  InlineCSS extends boolean = boolean,
  As extends keyof JSX.IntrinsicElements = "div",
  ReactType = any
> {
  children: ReactType;
  Root: RootComponentType<As, InlineCSS, PageProps, ReactType>;
  cssFiles: CssFile[];
  globalCss: CssFile[];
  pageProps: PageProps;
  Page: PageComponentType<PageProps, ReactType>;
  moduleBaseURL: string;
}
```

### RootProps

Props for CSS collector components:

```typescript
interface RootProps<
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

### Generic Types

The plugin uses generic types to maintain compatibility across React versions:

```typescript
// Generic function type that adapts to any React version
type RootComponentType<
  As extends keyof JSX.IntrinsicElements = "div",
  InlineCSS extends boolean = boolean,
  PageProps = any,
  ReactType = any
> = (props: RootProps<As, InlineCSS, PageProps, ReactType>) => ReactType;

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

<!-- AUTO-GENERATED-TOC-START -->

## 📚 Documentation Navigation

## Table of Contents

1.	[Getting Started](./getting-started.md)
	- [Installation and Setup](./getting-started.md#installation-and-setup)
	- [Basic Configuration](./getting-started.md#basic-configuration)
	- [Example Projects](./getting-started.md#example-projects)

2.	[Core Concepts](./core-concepts.md)
	- [Client-Server Separation](./core-concepts.md#client-server-separation)
	- [React Server Components](./core-concepts.md#react-server-components)
	- [Plugin Architecture](./core-concepts.md#plugin-architecture)

3.	[Configuration](./configuration.md)
	- [Plugin Options](./configuration.md#plugin-options)
	- [Routing Configuration](./configuration.md#routing-configuration)
	- [Build Configuration](./configuration.md#build-configuration)

4.	[Component Resolution](./component-resolution.md)
	- [Path-based vs Direct Components](./component-resolution.md#path-based-vs-direct-components)
	- [When to Use Each Approach](./component-resolution.md#when-to-use-each-approach)
	- [Migration Guide](./component-resolution.md#migration-guide)

5.	[CSS Handling](./css-handling.md)
	- [CSS Collectors](./css-handling.md#css-collectors)
	- [Inline CSS](./css-handling.md#inline-css)
	- [Custom CSS Processing](./css-handling.md#custom-css-processing)

6.	[Server Actions](./server-actions.md)
	- [Creating Server Actions](./server-actions.md#creating-server-actions)
	- [Client Integration](./server-actions.md#client-integration)
	- [Error Handling](./server-actions.md#error-handling)
	- [Database Integration](./server-actions.md#database-integration)

7.	[Static Site Generation](./static-site-generation.md)
	- [Static Plugin](./static-site-generation.md#static-plugin)
	- [Build Process](./static-site-generation.md#build-process)
	- [Deployment Strategies](./static-site-generation.md#deployment-strategies)

8.	[Build Orchestration](./build-orchestration.md)
	- [Multiple Build Targets](./build-orchestration.md#multiple-build-targets)
	- [Plugin Architecture](./build-orchestration.md#plugin-architecture)
	- [Environment-Specific Builds](./build-orchestration.md#environment-specific-builds)

9.	[Architecture](./architecture.md)
	- [Design Philosophy](./architecture.md#design-philosophy)
	- [Environment Variables](./architecture.md#environment-variables)
	- [Plugin Composition](./architecture.md#plugin-composition)
	- [HTML Component Support](./architecture.md#html-component-support)

10.	[Advanced Topics](./advanced-topics.md)
	- [Custom Workers](./advanced-topics.md#custom-workers)
	- [Message System](./advanced-topics.md#message-system)
	- [Extending the Plugin](./advanced-topics.md#extending-the-plugin)

11.	**[API Reference](./api-reference.md) ← you are here**
	- [Plugin Options](./api-reference.md#plugin-options)
	- [Component Props](./api-reference.md#component-props)
	- [Worker Messages](./api-reference.md#worker-messages)
	- [Type Definitions](./api-reference.md#type-definitions)

12.	[Transformations](./transformations.md)
	- [Code Transformations](./transformations.md#code-transformations)
	- [Directive Handling](./transformations.md#directive-handling)
	- [Build Output Examples](./transformations.md#build-output-examples)

13.	[Loader](./loader.md)
	- [React Server Components Loader](./loader.md#react-server-components-loader)
	- [Directive Processing](./loader.md#directive-processing)
	- [Module Boundaries](./loader.md#module-boundaries)
	- [Custom Registration Functions](./loader.md#custom-registration-functions)

14.	[Patch System](./patch-system.md)
	- [React Version Compatibility](./patch-system.md#react-version-compatibility)
	- [Creating Patches](./patch-system.md#creating-patches)
	- [Maintenance Guide](./patch-system.md#maintenance-guide)

15.	[Practical Guide](./practical-guide.md)
	- [Real-world Examples](./practical-guide.md#real-world-examples)
	- [Debugging Features](./practical-guide.md#debugging-features)
	- [Production Implementations](./practical-guide.md#production-implementations)

16.	[Troubleshooting Guide](./troubleshooting-guide.md)
	- [Common Issues](./troubleshooting-guide.md#common-issues)
	- [Debugging Tips](./troubleshooting-guide.md#debugging-tips)
	- [Performance Optimization](./troubleshooting-guide.md#performance-optimization)

### Quick Links
- [🏠 Main Documentation](./README.md)
- [🚀 Getting Started](./getting-started.md)
- [📖 GitHub Repository](https://github.com/nicobrinkkemper/vite-plugin-react-server)
- [🎮 Official Demo](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)

---

<!-- AUTO-GENERATED-TOC-END -->