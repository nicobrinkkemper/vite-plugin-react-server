# Core Concepts
This document explains the fundamental concepts and architecture of the Vite React Server Plugin.

## Client-Server Separation

The plugin operates with a clear separation between client and server contexts:

### Environment Detection

The plugin uses Node.js conditions to determine execution context:

```typescript
import { getCondition } from "vite-plugin-react-server/config";

const condition = getCondition();
// Returns: "react-server" | "react-client" | null
```

- **`react-server`**: Server-side rendering and React Server Components
- **`react-client`**: Client-side rendering and hydration
- **`null`**: Standard browser environment

### Execution Modes

```bash
# Server mode - direct React pipeline
NODE_OPTIONS="--conditions react-server" vite

# Client mode - uses worker threads
vite
```

## React Server Components (RSC)

### RSC Stream Processing

The plugin processes RSC streams through a pipeline:

1. **RSC Generation**: Server components generate RSC payload
2. **Stream Transformation**: RSC stream converted to HTML via workers
3. **HTML Output**: Final HTML written to bundle

There's two type of streams the plugin is able to generate:

#### Headless RSC streams

Headless means that it will only include the `Root` component.

During development, it streams headless mode for `text/x-component` requests. Alternatively, you can use the `.rsc` extension for the request.

During a build, the headless streams are written to the a file at `${route}/index.rsc`.

#### Full RSC streams

Full means they include the document html structure. `Html` and `Root` component. This stream is intended to be written to a file during the `build` process.   


```typescript
// RSC worker generates stream
const rscStream = renderToReadableStream(element);

// HTML worker transforms RSC to HTML
const htmlStream = createRscToHtmlStream({
  worker: htmlWorker,
  route: "/page",
  moduleBaseURL: "/",
});

rscStream.pipe(htmlStream);
```

### Worker Architecture

The plugin uses worker threads for RSC processing:

#### RSC Worker (`react-server` condition)
- Renders React Server Components
- Handles server actions
- Manages module loading with server conditions
- Streams RSC payload to HTML worker

#### HTML Worker (client environment)
- Receives RSC stream from RSC worker
- Transforms RSC to HTML using `ReactDOMServer.renderToPipeableStream`
- Handles CSS collection and asset processing
- Outputs final HTML

```typescript
// Worker communication
worker.postMessage({
  type: "RSC_CHUNK",
  id: route,
  chunk: rscChunk,
  sequence: 0,
});

worker.postMessage({
  type: "RSC_END",
  id: route,
});
```

## Plugin Architecture

### Core Components

1. **Main Plugin**: Orchestrates build process and development server
2. **RSC Worker**: Handles server-side React rendering
3. **HTML Worker**: Transforms RSC streams to HTML
4. **Loader System**: Manages module resolution and transformations

### Build Targets

The plugin generates three build outputs:

```
dist/
├── static/     # Browser-ready static files (HTML + RSC)
├── client/     # Server-side rendering modules  
└── server/     # React Server Components modules
```

#### Static Build (`vite build`)
- Generates static HTML files
- Includes RSC payload for hydration
- Optimizes assets for production

#### Client Build (`vite build --ssr`)
- Server-side rendering modules
- Hydration scripts
- Client-side assets

#### Server Build (`NODE_OPTIONS="--conditions react-server" vite build`)
- React Server Components
- Server actions
- Server-only modules

### Configuration Flow

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { Css } from "vite-plugin-react-server/components"

export default defineConfig({
  plugins: vitePluginReactServer({
    moduleBase: "src",
    Page: (url) => `src/pages${url}/page.tsx`,
    props: (url) => `src/pages${url}/props.ts`,
    components: {
      // optional: direct component inputs (react-server only)
      Html: ({ Root, cssFiles, globalCss, pageProps, Page }) => (
        <html>
          <head>
            <Css cssFiles={globalCss} />
          </head>
          <body>
            <Root as="div" id="root" cssFiles={cssFiles} Page={Page} pageProps={pageProps} />
          </body>
        </html>
      ),
    }
    build: { pages: ["/", "/about"] }
  })
});
```

## Module Resolution

### Auto-Discovery Patterns

The plugin uses regex patterns to identify different module types:

```typescript
const AUTO_DISCOVER = {
  modulePattern: /\.(m|c)?(j|t)sx?$/,
  serverPattern: /(?:\.\/)?server(?:\.(m|c)?(j|t)sx?)?$/,
  clientPattern: /(?:\.\/)?client(?:\.(m|c)?(j|t)sx?)?$/,
  pagePattern: /(?:\.\/)?page(?:\.(m|c)?(j|t)sx?)?$/,
  propsPattern: /(?:\.\/)?props(?:\.(m|c)?(j|t)sx?)?$/,
};
```

### Directive Processing

The plugin processes React directives to determine module boundaries with intelligent context-aware validation:

```typescript
// Server directive - can be file-level or function-level
"use server";
export async function serverAction() {
  // Server-only code
}

// Client directive - file-level only
"use client";
export function ClientComponent() {
  // Client-only code
}
```

### Advanced Directive Validation

The plugin provides comprehensive validation with context-aware error messages:

#### Context Detection

```typescript
// ✅ Valid: Top-level function with server directive
export async function validServerAction() {
  "use server";
  return await database.query();
}

// ❌ Invalid: Nested function
export function outer() {
  function inner() { 
    "use server"; // Invalid: nested function
    return 1; 
  }
}

// ❌ Invalid: Class method
export class Calculator {
  async add(a, b) { 
    "use server"; // Invalid: class method
    return a + b; 
  }
}
```

#### Error Detection Categories

The plugin provides specific, actionable error messages for:

- **Nested Functions**: Detects directives in functions inside other functions
- **Class Methods**: Identifies directives in class method definitions  
- **Non-async Server Functions**: Validates that server directives are in async functions
- **Function Type Detection**: Provides context-specific messages for arrow functions, class methods, etc.

#### Configuration Options

```typescript
const DIRECTIVE_CONFIGS = {
  client: {
    functionLevel: false,
    validate: (params) => params.index === 0, // Must be at file start
    warning: "'use client' directive is only allowed at the top of a file"
  },
  server: {
    functionLevel: true,
    validate: (params) => {
      const before = params.code.slice(0, params.index).trim();
      return before === '' || before.endsWith('\n');
    },
    warning: "File-level directives must be at the top of the file"
  }
};

// Error handling configuration
const panicThreshold = 'none' | 'critical_errors' | 'all_errors';
```

## CSS Handling

### CSS Collection

The plugin collects CSS from various sources:

1. **Module CSS**: CSS imported by components
2. **Global CSS**: Application-wide styles
3. **Inline CSS**: Styles embedded in HTML

```typescript
interface CssFile {
  href: string;
  content?: string;
  inline?: boolean;
  media?: string;
  rel?: string;
}
```

### Custom Root as CSS Filter Component

Here's an example from the MMC project, which uses the Root component to filter out some css modules that only include variables.

```typescript
import React from "react";
import { Css } from "vite-plugin-react-server/components";
import type { RootProps } from "vite-plugin-react-server/types";
import { mainTheme, themes } from "./config/themeConfig.js";

const removeableCSS = [
  "/src/css/4ymm.module.css",
  "/src/css/5-6ymm.module.css",
  "/src/css/7mmc.module.css",
  "/src/css/8mmc.module.css",
  "/src/css/9mmc.module.css",
];

const createFilter = (theme: Theme) => {
  if (theme === "5ymm" || theme === "6ymm") {
    return [theme, removeableCSS.filter((css) => css.includes("5-6ymm"))];
  }
  return [theme, removeableCSS.filter((css) => css.includes(theme))];
};

const filters = Object.fromEntries(themes.map(createFilter)) as {
  [key in Theme]: string[];
};

export const MmcRoot = ({
  as: Component,
  cssFiles = new Map<string, never>(),
  pageProps = { pathInfo: { theme: mainTheme } },
  Page,
  ...props
}: RootProps<{
  pathInfo: { theme: Theme };
}>) => {
  const theme = pageProps.pathInfo.theme;
  const cssArray = Array.from(cssFiles.values());
  const removeNonCurrentThemeCss = new Map(
    cssArray
      .filter(
        (file) =>
          !removeableCSS.includes(file.id) || filters[theme].includes(file.id)
      )
      .map((file) => [file.id, file])
  );
  return (
    <Component {...props}>
      <Page {...pageProps} />
      <Css cssFiles={removeNonCurrentThemeCss} />
    </Component>
  );
};

```

The Root component will be used during development and static generation.

## Message System

### Worker Communication

Workers communicate via structured messages:

```typescript
type WorkerMessage = 
  | { type: 'RSC_CHUNK'; id: string; chunk: ArrayBuffer; sequence: number }
  | { type: 'RSC_END'; id: string }
  | { type: 'HTML_CHUNK'; id: string; chunk: Buffer }
  | { type: 'HTML_COMPLETE'; id: string; metrics: StreamMetrics }
  | { type: 'ERROR'; id: string; error: Error };
```

### Message Handlers

```typescript
// RSC Worker message handler
export function messageHandler(msg: RscWorkerInputMessage) {
  switch (msg.type) {
    case "RSC_RENDER":
      return handleRscRender(msg);
    case "SERVER_ACTION":
      return handleServerAction(msg);
    case "CLEANUP":
      return handleCleanup(msg);
  }
}
```

## Development vs Production

### Development Mode

- Uses worker threads for RSC processing
- Hot module replacement (HMR) support
- Real-time error reporting
- Source map preservation

### Production Mode

- Optimized worker creation
- Minified output
- Asset optimization
- Performance metrics collection

## Error Handling

### Error Boundaries

```typescript
// HTML Worker error handling
const stream = ReactDOMServer.renderToPipeableStream(elements, {
  onError: (error: unknown, errorInfo: ErrorInfo) => {
    sendMessage({
      type: "ERROR",
      id,
      error: error instanceof Error ? error : new Error(String(error)),
      errorInfo: {
        componentStack: errorInfo.componentStack,
        digest: errorInfo.digest,
      },
    });
  },
  onShellError: (error: unknown) => {
    sendMessage({
      type: "SHELL_ERROR",
      id,
      error: error instanceof Error ? error : new Error(String(error)),
    });
  },
});
```

### Error Propagation

Errors are propagated through the message system:

1. Worker catches error
2. Serializes error details
3. Sends error message to main thread
4. Main thread handles error appropriately

## Performance Considerations

### Streaming

The plugin uses streaming for optimal performance:

- RSC streams are processed as they arrive
- HTML is generated incrementally
- CSS is collected and optimized during streaming

### Memory Management

- Workers have configurable memory limits
- Streams are cleaned up after processing
- Render states are garbage collected

### Metrics Collection

```typescript
interface StreamMetrics {
  chunks: number;
  bytes: number;
  duration: number;
  startTime: number;
  endTime?: number;
}
```

The plugin tracks performance metrics throughout the build process to help identify bottlenecks and optimize performance.

<!-- AUTO-GENERATED-TOC-START -->

## 📚 Documentation Navigation

## Table of Contents

1.	[Getting Started](./getting-started.md)
	- [Installation and Setup](./getting-started.md#installation-and-setup)
	- [Basic Configuration](./getting-started.md#basic-configuration)
	- [Example Projects](./getting-started.md#example-projects)

2.	**[Core Concepts](./core-concepts.md) ← you are here**
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

11.	[API Reference](./api-reference.md)
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