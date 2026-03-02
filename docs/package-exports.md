# Package Exports

The `vite-plugin-react-server` package provides comprehensive exports for all internal modules, making it easy to use the plugin's functionality in your own projects. The package uses **React conditions** to automatically provide the optimal implementation for each execution environment.

## Overview

The package exports are organized into logical groups and automatically adapt to the execution environment:

- **Core Plugins**: Main plugin entry points with condition-based loading
- **Workers**: RSC and HTML worker implementations
- **Helpers**: Stream creation and utility functions with environment-specific implementations
- **Configuration**: Options resolution and condition detection
- **Utilities**: React integration and URL handling
- **Loaders**: Module loading and directive processing
- **Types**: TypeScript type definitions

## React Conditions

The package automatically detects the execution environment and loads the appropriate implementation:

```typescript
// Automatic environment detection
import { getCondition } from 'vite-plugin-react-server/config';

const condition = getCondition(); // Returns 'client' or 'server'
const { vitePluginReactServer } = await import(`vite-plugin-react-server/plugin.${condition}`);
```

### Execution Environments

| Environment | Condition | Use Case | Implementation |
|-------------|-----------|----------|----------------|
| **Client** | `null` (default) | Browser, client-side builds | Client-specific modules |
| **Server** | `react-server` | Server-side rendering, RSC processing | Server-specific modules |

## Core Plugins

### Main Plugin (Condition-Based)
```typescript
// Automatically loads the correct implementation
import { vitePluginReactServer } from 'vite-plugin-react-server';
```

### Client Plugin
```typescript
// Explicitly import client implementation
import { vitePluginReactClient } from 'vite-plugin-react-server/client';
```

### Server Plugin
```typescript
// Explicitly import server implementation
import { vitePluginReactServer } from 'vite-plugin-react-server/server';
```

### Static Plugin
```typescript
// Condition-based static generation
import { vitePluginReactStatic } from 'vite-plugin-react-server/static';
```

## Development Server

### Dev Server (Condition-Based)
```typescript
// Automatically loads client or server implementation
import { configureReactServer } from 'vite-plugin-react-server/dev-server';
```

### Client Dev Server
```typescript
// Explicitly import client dev server
import { configureReactServer } from 'vite-plugin-react-server/dev-server/client';
```

### Server Dev Server
```typescript
// Explicitly import server dev server
import { configureReactServer } from 'vite-plugin-react-server/dev-server/server';
```

## Workers

### Worker System

The plugin supports two types of workers:

- **RSC Worker**: Handles React Server Components rendering
- **HTML Worker**: Handles HTML generation from RSC streams

### Worker Exports

#### General Worker Utilities
```typescript
import { createWorker } from 'vite-plugin-react-server/worker';
import type { WorkerOptions, WorkerMessage } from 'vite-plugin-react-server/worker';
```

#### RSC Worker
```typescript
// Import the RSC worker (registers itself)
import 'vite-plugin-react-server/rsc-worker';

// Import RSC worker types
import type { RscRenderOpt, RscRenderResult } from 'vite-plugin-react-server/rsc-worker';
```

#### HTML Worker
```typescript
// Import the HTML worker (registers itself)
import 'vite-plugin-react-server/html-worker';

// Import HTML worker types
import type { HtmlRenderOpt, HtmlRenderResult } from 'vite-plugin-react-server/html-worker';
```

### Worker Usage Examples

#### Creating Custom Workers
```typescript
import { createWorker } from 'vite-plugin-react-server/worker';

const rscWorker = createWorker({
  workerPath: 'path/to/custom-rsc-worker.js',
  // ... worker options
});
```

#### Using Built-in Workers
```typescript
// RSC worker is automatically available when imported
import 'vite-plugin-react-server/rsc-worker';

// HTML worker is automatically available when imported
import 'vite-plugin-react-server/html-worker';
```

## Stream Helpers

### Stream Creation
```typescript
// RSC and HTML stream creation (from stream export)
import { createRscStream, createHtmlStream, handleRscStream } from 'vite-plugin-react-server/stream';

// Client-specific stream
import { ... } from 'vite-plugin-react-server/stream/client';

// Server-specific stream
import { ... } from 'vite-plugin-react-server/stream/server';
```

### Helpers
```typescript
// Route resolution, serialization, CSS collection, etc.
import { getRouteFiles, resolvePage, resolveProps, collectManifestCss } from 'vite-plugin-react-server/helpers';
```

## Utilities

### Utils (Conditional Export)

The `./utils` export uses **conditional exports** — the available APIs differ based on the execution environment:

```typescript
// Default (client) condition — full API including React hooks and browser fetcher
import { 
  createReactFetcher, setupRscHmr, useRscHmr, // browser-only
  callServer, createCallServer, env, routeToURL,
  addLeadingSlash, addTrailingSlash, createAbsoluteURL, // URL helpers
} from 'vite-plugin-react-server/utils';
```

```typescript
// react-server condition — excludes browser-only modules
// (createReactFetcher, setupRscHmr, useRscHmr are NOT available)
import { 
  callServer, createCallServer, env, routeToURL,
  addLeadingSlash, addTrailingSlash, createAbsoluteURL,
} from 'vite-plugin-react-server/utils';
```

> The react-server version excludes `createReactFetcher`, `setupRscHmr`, `useRscHmr`, `callServer`, and `createCallServer` because they import from `react-server-dom-esm/client.browser` and/or use React hooks that are incompatible with the react-server condition.

### Register Hook

The `./register` export provides a Node.js register hook for resolving `react-server-dom-esm` imports outside of Vite (e.g. startup scripts, SSR servers):

```bash
node --import vite-plugin-react-server/register ./your-script.mjs
```

### Patch System
```typescript
// react-server-dom-esm is vendored with the plugin since v1.3.0
// Available as: npx vite-plugin-react-server-patch
import 'vite-plugin-react-server/patch'; // → bin/patch.mjs
```

## Configuration

### Condition Detection
```typescript
import { getCondition } from 'vite-plugin-react-server/config';
import { getNodeEnv } from 'vite-plugin-react-server/config';
```

### Options Resolution
```typescript
import { resolveOptions } from 'vite-plugin-react-server/config';
import type { PluginOptions } from 'vite-plugin-react-server/config';
```

## React Integration

### React Components (Condition-Based)
```typescript
// Automatically loads appropriate React implementation
import { createElementWithReact } from 'vite-plugin-react-server/helpers';
```

### Client React Integration
```typescript
// Client-specific React integration
import { createElementWithReact } from 'vite-plugin-react-server/helpers/client';
```

### Server React Integration
```typescript
// Server-specific React integration
import { createElementWithReact } from 'vite-plugin-react-server/helpers/server';
```

## Loaders

### Module Loaders (Condition-Based)
```typescript
// Automatically loads appropriate loader implementation
import { createLoader } from 'vite-plugin-react-server/loader';
```

### Client Loaders
```typescript
// Client-specific module loading
import { createLoader } from 'vite-plugin-react-server/loader/client';
```

### Server Loaders
```typescript
// Server-specific module loading
import { createLoader } from 'vite-plugin-react-server/loader/server';
```

## Types

### Shared Types
```typescript
// Common type definitions
import type { PluginOptions, StreamOptions } from 'vite-plugin-react-server/types';
```

### Environment-Specific Types
```typescript
// Client-specific types
import type { ClientOptions } from 'vite-plugin-react-server/types/client';

// Server-specific types
import type { ServerOptions } from 'vite-plugin-react-server/types/server';
```

## Usage Patterns

### Automatic Environment Detection

The recommended approach is to use the main exports, which automatically detect the environment:

```typescript
// Automatically uses the correct implementation
import { vitePluginReactServer } from 'vite-plugin-react-server';
import { createHandler } from 'vite-plugin-react-server/helpers';
import { configureReactServer } from 'vite-plugin-react-server/dev-server';
```

### Explicit Environment Selection

For advanced use cases, you can explicitly import environment-specific implementations:

```typescript
// Client environment
import { vitePluginReactClient } from 'vite-plugin-react-server/client';
import { createHandler } from 'vite-plugin-react-server/helpers/client';

// Server environment
import { vitePluginReactServer } from 'vite-plugin-react-server/server';
import { createHandler } from 'vite-plugin-react-server/helpers/server';
```

### Custom Module Development

When creating custom modules that integrate with the plugin, follow the same pattern:

```typescript
// myModule.ts
import { getCondition } from 'vite-plugin-react-server/config';

const condition = getCondition();
const { myFunction } = await import(`./myModule.${condition}.js`);

export { myFunction };
```

## Environment Variables

The package respects Node.js conditions for environment detection:

```bash
# Server environment
NODE_OPTIONS="--conditions react-server" node your-script.js

# Client environment (default)
node your-script.js
```

## Build Optimization

React conditions provide several optimization benefits:

- **Tree shaking**: Unused code is automatically eliminated
- **Bundle size**: Smaller bundles for client environments
- **Conditional compilation**: Server-specific features only included when needed
- **Runtime performance**: No overhead from unused server code in client environments

## Migration Guide

If you're migrating from an older version:

### Before (Single Implementation)
```typescript
import { someFunction } from 'vite-plugin-react-server/some-module';
```

### After (Condition-Based)

```typescript
// Recommended: Use main export (automatic detection)
import { someFunction } from 'vite-plugin-react-server/some-module';

// Or explicitly specify environment
import { someFunction } from 'vite-plugin-react-server/some-module/client';
import { someFunction } from 'vite-plugin-react-server/some-module/server';
```

<!-- TOC START -->

## 📚 Documentation Navigation

<!-- Auto-generated TOC - Do not edit manually -->

## Table of Contents

<!-- Auto-generated TOC - Do not edit manually -->



1.	[Getting Started](./getting-started.md)
2.	[Core Concepts](./core-concepts.md)
3.	[Configuration Guide](./configuration.md)
4.	[CSS & Styling](./css-handling.md)
5.	[Server Actions](./server-actions.md)
6.	[Build & Deployment](./build-orchestration.md)
7.	[Advanced Development](./maintenance/advanced-topics.md)
8.	[Plugin Internals](./maintenance/transformer-plugin.md)
9.	[Worker System](./maintenance/rsc-worker.md)
10.	[API Reference](./api-reference.md)
11.	[React Compatibility](./react-type-compatibility.md)
12.	[Troubleshooting](./troubleshooting-guide.md)
13.	**[Package Exports](./package-exports.md) ← you are here**
14.	[Transformations](./transformations.md)

### Quick Links
- [🏠 Main Documentation](./README.md)
- [🚀 Getting Started](./getting-started.md)
- [📖 GitHub Repository](https://github.com/nicobrinkkemper/vite-plugin-react-server)
- [🎮 Official Demo](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)

---

<!-- TOC END -->

 