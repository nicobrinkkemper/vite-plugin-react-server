# Build Process Documentation

This document explains the build orchestration, static generation, and build lifecycle in the `vite-plugin-react-server` project.

## 🏗️ Build Architecture Overview

The plugin supports multiple build modes and environments:

1. **Traditional Build** - Standard Vite build with SSR
2. **Environment API Build** - Multi-environment builds using Vite's Environment API
3. **Static Generation** - Pre-rendering pages to static files
4. **Client Dev Server** - Development server for client environment

## 🔄 Build Lifecycle

### Traditional Build Process

```typescript
// Standard Vite build with SSR
await build({
  plugins: [vitePluginReactServer(options)],
  build: {
    ssr: true,
    outDir: "dist",
  },
});
```

### Environment API Build Process

```typescript
// Multi-environment build using Environment API
const builder = await createBuilder({
  plugins: vitePluginReactServer(options),
  environments: {
    client: {
      build: { ssr: false, outDir: "dist/client" },
    },
    server: {
      build: { ssr: true, outDir: "dist/server" },
    },
  },
});

await builder.buildApp();
```

## 📦 Static Generation

### Overview

Static generation pre-renders pages to static files (HTML and RSC) at build time. The plugin supports both client-side and server-side static generation.

### Server-Side Static Generation

```typescript
// Server-side static generation
const events = await doBuild({
  projectRoot: '/path/to/project',
  pages: ['/'],
  onEvent: (event) => {
    // Handle build events
  },
  onMetrics: (metrics) => {
    // Handle performance metrics
  },
});
```

### Client-Side Static Generation

```typescript
// Client-side static generation
const events = await doBuildStaticClient({
  projectRoot: '/path/to/project',
  pages: ['/'],
  onEvent: (event) => {
    // Handle build events
  },
  onMetrics: (metrics) => {
    // Handle performance metrics
  },
});
```

## 🎯 Build Configuration

### Core Options

```typescript
interface BuildOptions {
  projectRoot: string;           // Root directory of the project
  pages?: string[];             // Pages to generate (default: all)
  verbose?: boolean;            // Enable verbose logging
  panicThreshold?: string;      // Error threshold for build abortion
  onEvent?: (event: BuildEvent) => void;  // Event callback
  onMetrics?: (metrics: BuildMetrics) => void;  // Metrics callback
}
```

### Build Events

The build process emits various events that can be monitored:

```typescript
interface BuildEvent {
  type: string;
  data?: any;
  timestamp: number;
}

// Common event types:
// - 'build.start' - Build process started
// - 'build.end' - Build process completed
// - 'page.start' - Page generation started
// - 'page.end' - Page generation completed
// - 'file.write.start' - File writing started
// - 'file.write.done' - File writing completed
// - 'error' - Error occurred
```

### Build Metrics

Performance metrics are collected during the build process:

```typescript
interface BuildMetrics {
  page: string;
  phase: 'rsc' | 'html' | 'complete';
  duration: number;
  memoryUsage?: number;
  fileSizes?: {
    rsc?: number;
    html?: number;
  };
}
```

## 🔧 Build Helpers

### doBuild Function

The main build helper for server-side static generation:

```typescript
// test/doBuild.ts
export async function doBuild(options: BuildOptions): Promise<BuildEvent[]> {
  const events: BuildEvent[] = [];
  
  // Configure build options
  const buildConfig = {
    plugins: [vitePluginReactServer(options)],
    build: {
      ssr: true,
      outDir: "dist",
    },
  };
  
  // Execute build with event collection
  await build(buildConfig);
  
  return events;
}
```

### doBuildStaticClient Function

Client-side static generation helper:

```typescript
// test/doBuildStaticClient.ts
export async function doBuildStaticClient(options: BuildOptions): Promise<BuildEvent[]> {
  const events: BuildEvent[] = [];
  
  // Configure client-side build
  const buildConfig = {
    plugins: [vitePluginReactServer(options)],
    build: {
      ssr: false,
      outDir: "dist/client",
    },
  };
  
  // Execute client-side build
  await build(buildConfig);
  
  return events;
}
```

## 🚀 Build Orchestration

### Page Discovery

The build process automatically discovers pages to generate:

1. **File-based routing** - Pages are discovered from the file system
2. **Configuration-based** - Pages can be explicitly specified
3. **Dynamic routes** - Support for dynamic route generation

### File Generation

For each page, the build process generates:

1. **RSC File** (`.rsc`) - React Server Component payload
2. **HTML File** (`.html`) - Static HTML with embedded RSC
3. **Assets** - CSS, JavaScript, and other assets

### Worker System

The build process uses a worker system for parallel processing:

```typescript
// RSC Worker for React Server Components
const rscWorker = new RSCWorker({
  projectRoot: options.projectRoot,
  onEvent: (event) => events.push(event),
});

// HTML Worker for HTML generation
const htmlWorker = new HTMLWorker({
  projectRoot: options.projectRoot,
  onEvent: (event) => events.push(event),
});
```

## 🔍 Build Debugging

### Verbose Logging

Enable verbose logging to debug build issues:

```typescript
const events = await doBuild({
  projectRoot: '/path/to/project',
  verbose: true,  // Enable verbose logging
});
```

### Event Monitoring

Monitor build events for debugging:

```typescript
const events = await doBuild({
  projectRoot: '/path/to/project',
  onEvent: (event) => {
    console.log(`[${event.type}]`, event.data);
  },
});
```

### Error Handling

The build process includes comprehensive error handling:

```typescript
const events = await doBuild({
  projectRoot: '/path/to/project',
  panicThreshold: 'all_errors',  // Abort on any error
  onEvent: (event) => {
    if (event.type === 'error') {
      console.error('Build error:', event.data);
    }
  },
});
```

## 📊 Performance Optimization

### Build Performance

- **Parallel Processing** - Pages are processed in parallel using workers
- **Caching** - Build artifacts are cached for incremental builds
- **Memory Management** - Efficient memory usage during large builds

### Optimization Strategies

1. **Page Filtering** - Only generate necessary pages
2. **Asset Optimization** - Minimize and optimize assets
3. **Caching** - Cache build artifacts for faster rebuilds
4. **Parallelization** - Use multiple workers for parallel processing

## 🔗 Related Documentation

- [Environment API Guide](./ENVIRONMENT_API.md) - Multi-environment builds
- [Testing Guide](./TESTING.md) - Build testing strategies
- [Plugin Architecture](./PLUGIN_ARCHITECTURE.md) - Plugin internals
- [Performance Monitoring](./PERFORMANCE.md) - Performance optimization

---

*This documentation covers the build process and static generation. For specific implementation details, refer to the source code in the `plugin/build/` directory.*
