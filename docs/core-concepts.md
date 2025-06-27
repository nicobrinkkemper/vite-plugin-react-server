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
3. **HTML Output**: Final HTML delivered to client

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

export default defineConfig({
  plugins: vitePluginReactServer({
    moduleBase: "src",
    Page: (url) => `src/pages${url}/page.tsx`,
    props: (url) => `src/pages${url}/props.ts`,
    Html: ({ Root, cssFiles, pageProps, Page }) => (
      <html>
        <body>
          <Root as="div" cssFiles={cssFiles} Page={Page} pageProps={pageProps} />
        </body>
      </html>
    ),
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

### CSS Collector Component

```typescript
export const Root = ({ 
  as = "div", 
  cssFiles, 
  Page, 
  pageProps 
}: RootProps) => {
  return (
    <As>
      {cssFiles.map(css => 
        css.inline ? 
          <style key={css.href}>{css.content}</style> :
          <link key={css.href} href={css.href} rel="stylesheet" />
      )}
      <Page {...pageProps} />
    </As>
  );
};
```

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
