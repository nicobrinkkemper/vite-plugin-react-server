# Plugin Architecture Documentation

This document explains the internal architecture, component interactions, and design patterns used in the `vite-plugin-react-server` project.

## 🏗️ Architecture Overview

The plugin is built around a modular architecture with clear separation of concerns:

```
vite-plugin-react-server/
├── plugin/
│   ├── index.ts              # Main plugin entry point
│   ├── plugin.client.ts      # Client plugin
│   ├── plugin.server.ts      # Server plugin
│   ├── transformer/          # Component transformation system
│   │   ├── createTransformerPlugin.ts  # Main transformer factory
│   │   └── transformerEnv.ts # Environment detection
│   ├── loader/              # Module loaders and transformers
│   ├── worker/              # RSC worker system
│   ├── dev-server/          # Development server
│   ├── react-static/        # Static generation
│   ├── react-client/        # Client-side rendering
│   ├── react-server/        # Server-side rendering
│   ├── stream/              # Stream processing
│   ├── config/              # Configuration management
│   └── helpers/             # Utility functions
├── test/                    # Test infrastructure
└── docs/                    # Documentation
```

## 🔌 Core Plugin Components

### Main Plugin Entry Point (`plugin/index.ts`)

The main plugin orchestrates all other components:

```typescript
export default function vitePluginReactServer(options: PluginOptions): Plugin {
  return {
    name: 'vite-plugin-react-server',
    apply: 'build',
    
    config(config, env) {
      // Configure Vite for React Server Components
      return {
        resolve: {
          conditions: ['react-server'],
        },
        build: {
          ssr: true,
        },
      };
    },
    
    configureServer(server) {
      // Set up development server
    },
    
    generateBundle(options, bundle) {
      // Handle static generation
    },
  };
}
```

### Transformer Plugin (`plugin/transformer/createTransformerPlugin.ts`)

Handles component transformations and React Server Component setup:

```typescript
export const createTransformerPlugin = (
  options: TransformerPluginOptions
): VitePluginFn => {
  return (userOptions) => {
    const { name } = options;
    const defaultEnvironment = options.defaultEnvironment ?? 
      (name === "client" ? "client" : "server");
    
    return {
      name: `vite-plugin-react-server:transform-${name}`,
      transform(code, id) {
        // Transform based on environment and directives
        const transformer = createTransformer({
          options: resolvedOptions,
          isServerEnvironment: isServerTransform(),
        });
        
        return transformer(code, id);
      },
    };
  };
};
```

## 🔄 Component Transformation System

### Client Component Transformation

Client components are transformed to work with React Server Components. In the server environment, client components are replaced with `registerClientReference` calls:

```typescript
// Before transformation (client environment)
export default function MyComponent() {
  return <div>Hello World</div>;
}

// After transformation (server environment)
import { registerClientReference } from "react-server-dom-esm/server";
export default registerClientReference(
  function() { throw new Error("Attempted to call default() on the client"); }, 
  "/src/components/MyComponent.tsx", 
  "default"
);
```

### Server Component Transformation

Server components are prepared for RSC serialization. Server actions are registered with `registerServerReference`:

```typescript
// Before transformation
"use server";

export async function add(a: number, b: number) {
  return a + b;
}

// After transformation
import { registerServerReference } from "react-server-dom-esm/server.node";

function add(a: number, b: number) {
  return a + b;
}

registerServerReference(add, "/src/page/actions.server.ts", "add");
export { add };
```

### Transformation Rules

1. **Client Components**: Marked with `"use client"` at the top of the file, OR matched by `CLIENT_FILENAME_PATTERN = /(^|[\/.])client\.[cm]?[jt]sx?$/` (covers `Foo.client.tsx` and standalone `client.tsx`, widened in 1.11.1).
2. **Server Components**: Default behavior, no special marking needed.
3. **Server Actions**: Marked with `"use server"` at file or function level.
4. **Environment-specific**: Transformations only occur in server environment (`react-server` condition).
5. **Directive-based**: Transformations are triggered by React RSC directives (`"use client"`, `"use server"`).
6. **Single classifier**: Every "is this a client module?" decision routes through `detectClientModule({ source, moduleId, parseFn? })` in `plugin/loader/directives/detectClientModule.ts`. The transformer passes Rollup's `this.parse` for AST analysis; the dev-server file watcher, worker react-loader, build auto-discover, and `loader.*` defaults use the parser-free fallback. Do not introduce a parallel "looks like a client module" check — feed `detectClientModule`.

### Client-Module AutoDiscovery

Two discoverers compose into the build's client input set:

| Discoverer | File | Picks up |
|------------|------|----------|
| `createGlobAutoDiscover("**/*.client.*")` | `plugin/config/autoDiscover/createGlobAutoDiscover.ts` | Filename-convention modules |
| `createDirectiveClientAutoDiscover()` (1.10.0+) | `plugin/config/autoDiscover/createDirectiveClientAutoDiscover.ts` | Directive-only modules under `moduleBase` |

The directive discoverer walks `**/*.{tsx,jsx,mts,cts,ts,js,mjs,cjs}`, skips `node_modules`, skips files already covered by the filename convention, then admits files where `sourceHasTopLevelClientDirective(source)` returns `true`.

**index.html script-src filter (1.11.2)**: the directive discoverer also reads `<projectRoot>/index.html` once and skips any candidate matching a `<script type="module" src="…">` entry. Without this, Vite drops its own `index.html` manifest entry when an explicit input collides — and `collectManifestCss(staticManifest, "index.html")` in `plugin/react-static/processCssFilesForPages.ts:34` returns `{}`, killing global CSS for every page. See `createDirectiveClientAutoDiscover.ts:60-79`.

## 🏭 Worker System Architecture

### RSC Worker (`plugin/worker/rsc-worker.ts`)

The RSC worker handles React Server Component rendering:

```typescript
export class RSCWorker {
  private worker: Worker;
  private messageQueue: Map<string, Promise<any>>;
  
  constructor(options: RSCWorkerOptions) {
    this.worker = new Worker(options.workerPath);
    this.messageQueue = new Map();
  }
  
  async render(page: string, props?: any): Promise<RSCResult> {
    const messageId = generateId();
    const promise = new Promise((resolve, reject) => {
      this.messageQueue.set(messageId, { resolve, reject });
    });
    
    this.worker.postMessage({
      id: messageId,
      type: 'render',
      page,
      props,
    });
    
    return promise;
  }
}
```

### HTML Worker (`plugin/worker/html-worker.ts`)

The HTML worker handles HTML generation from RSC streams:

```typescript
export class HTMLWorker {
  private worker: Worker;
  
  constructor(options: HTMLWorkerOptions) {
    this.worker = new Worker(options.workerPath);
  }
  
  async generateHTML(rscStream: ReadableStream): Promise<string> {
    // Convert RSC stream to HTML
    return this.worker.postMessage({
      type: 'generate-html',
      rscStream,
    });
  }
}
```

## 🚀 Build Orchestration

### Build Plugin (`plugin/build/index.ts`)

Orchestrates the static generation process:

```typescript
export function createBuildPlugin(options: BuildOptions): Plugin {
  return {
    name: 'vite-plugin-react-server:build',
    
    async generateBundle(options, bundle) {
      const pages = await discoverPages(options.projectRoot);
      
      for (const page of pages) {
        // Generate RSC
        const rscResult = await rscWorker.render(page);
        
        // Generate HTML
        const htmlResult = await htmlWorker.generateHTML(rscResult.stream);
        
        // Write files
        await writeRSCFile(page, rscResult);
        await writeHTMLFile(page, htmlResult);
      }
    },
  };
}
```

### Page Discovery

Automatically discovers pages to generate:

```typescript
export async function discoverPages(projectRoot: string): Promise<string[]> {
  const pages: string[] = [];
  
  // File-based routing discovery
  const pageFiles = await glob('src/pages/**/*.{tsx,jsx}', { cwd: projectRoot });
  
  for (const file of pageFiles) {
    const page = fileToPage(file);
    pages.push(page);
  }
  
  return pages;
}
```

## 🔧 Module Loader System

### Generic Module Loader (`plugin/loader/generic-module-loader.ts`)

Unified loader for both build and development:

```typescript
export class GenericModuleLoader {
  constructor(private options: LoaderOptions) {}
  
  async loadModule(modulePath: string): Promise<any> {
    // Dynamic import with proper error handling
    try {
      const module = await import(modulePath);
      return module;
    } catch (error) {
      throw new Error(`Failed to load module: ${modulePath}`);
    }
  }
}
```

### Worker Loader (`plugin/loader/worker-loader.ts`)

Specialized loader for worker environments:

```typescript
export class WorkerLoader extends GenericModuleLoader {
  constructor(options: WorkerLoaderOptions) {
    super(options);
  }
  
  async loadModule(modulePath: string): Promise<any> {
    // Worker-specific module loading logic
    return super.loadModule(modulePath);
  }
}
```

## 🎯 Client Dev Server

### Client Dev Server Plugin (`plugin/client-dev-server/index.ts`)

Provides development server functionality for client environment:

```typescript
export function createClientDevServerPlugin(options: ClientDevServerOptions): Plugin {
  return {
    name: 'vite-plugin-react-server:client-dev-server',
    
    configureServer(server) {
      // Set up client development server
      server.middlewares.use('/api', createAPIMiddleware());
      server.middlewares.use('/', createPageMiddleware());
    },
  };
}
```

### API Middleware

Handles API routes in development:

```typescript
function createAPIMiddleware() {
  return async (req: IncomingMessage, res: ServerResponse, next: NextFunction) => {
    if (req.url?.startsWith('/api/')) {
      // Handle API routes
      const handler = await loadAPIHandler(req.url);
      await handler(req, res);
    } else {
      next();
    }
  };
}
```

## 🔄 Event System

### Event Types

The plugin uses a comprehensive event system:

```typescript
interface PluginEvent {
  type: string;
  data?: any;
  timestamp: number;
  source: string;
}

// Common event types:
// - 'build.start' - Build process started
// - 'build.end' - Build process completed
// - 'page.start' - Page generation started
// - 'page.end' - Page generation completed
// - 'worker.start' - Worker started
// - 'worker.end' - Worker completed
// - 'error' - Error occurred
```

### Event Handling

Events are handled through callbacks:

```typescript
export interface PluginOptions {
  onEvent?: (event: PluginEvent) => void;
  onMetrics?: (metrics: PluginMetrics) => void;
  verbose?: boolean;
}
```

## 🎨 CSS Handling

### CSS Module Support

The plugin includes comprehensive CSS handling:

```typescript
export function createCSSPlugin(options: CSSOptions): Plugin {
  return {
    name: 'vite-plugin-react-server:css',
    
    transform(code, id) {
      if (isCSSModule(id)) {
        return transformCSSModule(code, id);
      }
    },
    
    generateBundle(options, bundle) {
      // Extract and inline CSS
      const css = extractCSS(bundle);
      inlineCSS(bundle, css);
    },
  };
}
```

### CSS Inlining

CSS is inlined for optimal performance:

```typescript
function inlineCSS(bundle: OutputBundle, css: string) {
  for (const [fileName, chunk] of Object.entries(bundle)) {
    if (chunk.type === 'chunk' && chunk.isEntry) {
      chunk.code = `<style>${css}</style>\n${chunk.code}`;
    }
  }
}
```

## 🔍 Error Handling

### Error Types

The plugin handles various error types:

```typescript
export class PluginError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'PluginError';
  }
}

// Common error codes:
// - 'BUILD_FAILED' - Build process failed
// - 'WORKER_ERROR' - Worker process error
// - 'TRANSFORM_ERROR' - Component transformation error
// - 'LOADER_ERROR' - Module loading error
```

### Error Recovery

The plugin includes error recovery mechanisms:

```typescript
export function createErrorHandler(options: ErrorHandlerOptions) {
  return {
    handleError(error: Error, context: ErrorContext) {
      // Log error
      if (options.verbose) {
        console.error(`[${context.source}] Error:`, error);
      }
      
      // Emit error event
      options.onEvent?.({
        type: 'error',
        data: { error, context },
        timestamp: Date.now(),
        source: context.source,
      });
      
      // Determine if build should continue
      if (options.panicThreshold === 'all_errors') {
        throw error;
      }
    },
  };
}
```

## 🔗 Related Documentation

- [Debugging Guide](./DEBUGGING.md) - Advanced debugging techniques
- [Error Handling](./ERROR_HANDLING.md) - Error handling patterns
- [Testing Guide](./TESTING.md) - Test troubleshooting


---

*This documentation covers the plugin architecture and internal design. For implementation details, refer to the source code in the `plugin/` directory.*
