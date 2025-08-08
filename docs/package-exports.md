# Package Exports

The `vite-plugin-react-server` package provides comprehensive exports for all internal modules, making it easy to use the plugin's functionality in your own projects.

## Overview

The package exports are organized into logical groups:

- **Core Plugins**: Main plugin entry points
- **Workers**: RSC and HTML worker implementations
- **Helpers**: Stream creation and utility functions
- **Configuration**: Options resolution and condition detection
- **Utilities**: React integration and URL handling
- **Loaders**: Module loading and directive processing
- **Types**: TypeScript type definitions

## Core Plugins

### Main Plugin
```typescript
import { reactServerPlugin } from 'vite-plugin-react-server';
```

### Client Plugin
```typescript
import { reactClientPlugin } from 'vite-plugin-react-server/client';
```

### Server Plugin
```typescript
import { reactServerPlugin } from 'vite-plugin-react-server/server';
```

### Static Plugin
```typescript
import { reactStaticPlugin } from 'vite-plugin-react-server/static';
```

## Workers

### Worker Architecture

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

## Helpers

### Stream Creation

#### createHandler
```typescript
import { createHandler } from 'vite-plugin-react-server/helpers';
import type { CreateHandlerOptions } from 'vite-plugin-react-server/helpers';

const rscHandler = createHandler({
  route: '/home',
  PageComponent: HomePage,
  // ... options
});
```

#### createHtmlStream
```typescript
import { createHtmlStream } from 'vite-plugin-react-server/helpers';
import type { CreateHtmlStreamOptions } from 'vite-plugin-react-server/helpers';

const htmlHandler = createHtmlStream({
  route: '/home',
  rscStream: rscStream,
  // ... options
});
```

#### createWorkerStream
```typescript
import { createWorkerStream } from 'vite-plugin-react-server/helpers';
import type { CreateWorkerStreamOptions } from 'vite-plugin-react-server/helpers';

const workerStream = createWorkerStream({
  worker: rscWorker,
  messageType: 'RSC_RENDER',
  // ... options
});
```

### Component Resolution

#### resolveComponents
```typescript
import { resolveComponents } from 'vite-plugin-react-server/helpers';

const components = await resolveComponents({
  pagePath: 'src/pages/home.tsx',
  propsPath: 'src/pages/home.props.ts',
  // ... options
});
```

#### resolveProps
```typescript
import { resolveProps } from 'vite-plugin-react-server/helpers';

const props = await resolveProps('src/pages/home.props.ts');
```

### CSS Handling

#### collectManifestCss
```typescript
import { collectManifestCss } from 'vite-plugin-react-server/helpers';

const cssFiles = collectManifestCss(manifest, route);
```

#### createCssProps
```typescript
import { createCssProps } from 'vite-plugin-react-server/helpers';

const cssProps = createCssProps(cssFiles, globalCss);
```

### Utility Functions

#### stashReturnValue
```typescript
import { stashReturnValue, clearStashedReturnValues } from 'vite-plugin-react-server/helpers';

const cachedFn = stashReturnValue(expensiveFunction);
```

#### hydrateUserOptions
```typescript
import { hydrateUserOptions } from 'vite-plugin-react-server/helpers';

const hydratedOptions = hydrateUserOptions(options);
```

## Configuration

### Condition Detection

#### getCondition
```typescript
import { getCondition, isReactServerCondition, isReactClientCondition } from 'vite-plugin-react-server/config';

const condition = getCondition(); // 'react-server' or 'react-client'
const isServer = isReactServerCondition();
const isClient = isReactClientCondition();
```

### Options Resolution

#### resolveOptions
```typescript
import { resolveOptions } from 'vite-plugin-react-server/config';

const resolved = resolveOptions(userOptions);
```

#### resolveUserConfig
```typescript
import { resolveUserConfig } from 'vite-plugin-react-server/config';

const config = resolveUserConfig({
  condition: 'react-server',
  config: viteConfig,
  // ... options
});
```

### Module ID Creation

#### createModuleID
```typescript
import { createModuleID } from 'vite-plugin-react-server/config';

const moduleID = createModuleID(options, configEnv, mode);
```

### Auto Discovery

#### resolveAutoDiscover
```typescript
import { resolveAutoDiscover } from 'vite-plugin-react-server/config';

const autoDiscover = await resolveAutoDiscover({
  config: viteConfig,
  configEnv,
  userOptions,
  condition: 'react-server',
  logger,
});
```

## Utilities

### React Integration

#### createReactFetcher
```typescript
import { createReactFetcher } from 'vite-plugin-react-server/utils';

const fetcher = createReactFetcher({
  baseURL: '/api',
  // ... options
});
```

#### callServer
```typescript
import { callServer } from 'vite-plugin-react-server/utils';

const result = await callServer(action, args);
```

### URL Handling

#### routeToURL
```typescript
import { routeToURL } from 'vite-plugin-react-server/utils';

const url = routeToURL('/home', '/api');
```

#### createCallServer
```typescript
import { createCallServer } from 'vite-plugin-react-server/utils';

const callServerFn = createCallServer({
  baseURL: '/api',
  // ... options
});
```

## Loaders

### React Loader
```typescript
import { reactLoader } from 'vite-plugin-react-server/react-loader';
```

### Environment Loader
```typescript
import { envLoader } from 'vite-plugin-react-server/env-loader';
```

### CSS Loader
```typescript
import { cssLoader } from 'vite-plugin-react-server/css-loader';
```

### Directives
```typescript
import { directives } from 'vite-plugin-react-server/directives';
```

## Error Handling

### Error Utilities
```typescript
import { handleError, shouldPanic } from 'vite-plugin-react-server/error';
import type { PanicThreshold } from 'vite-plugin-react-server/error';

const error = handleError({
  error: new Error('Something went wrong'),
  logger,
  panicThreshold: 'critical_errors',
  context: 'My function',
});
```

## Metrics

### Performance Monitoring
```typescript
import { createStreamMetrics, createRenderMetrics } from 'vite-plugin-react-server/metrics';

const streamMetrics = createStreamMetrics();
const renderMetrics = createRenderMetrics('/home');
```

## Types

### Core Types
```typescript
import type {
  VitePluginFn,
  CreateHandlerOptions,
  CreateHtmlStreamOptions,
  WorkerOptions,
  // ... many more types
} from 'vite-plugin-react-server/types';
```

### Worker Types
```typescript
import type {
  RscRenderOpt,
  RscRenderResult,
  HtmlRenderOpt,
  HtmlRenderResult,
} from 'vite-plugin-react-server/worker';
```

## Usage Patterns

### Basic Plugin Setup
```typescript
import { defineConfig } from 'vite';
import { reactServerPlugin } from 'vite-plugin-react-server';

export default defineConfig({
  plugins: [
    reactServerPlugin({
      // ... plugin options
    }),
  ],
});
```

### Custom Stream Creation
```typescript
import { createHandler, createHtmlStream } from 'vite-plugin-react-server/helpers';

// Create RSC stream
const rscHandler = createHandler({
  route: '/home',
  PageComponent: HomePage,
  // ... options
});

// Create HTML stream from RSC
const htmlHandler = createHtmlStream({
  route: '/home',
  rscStream: rscStream,
  // ... options
});
```

### Custom Worker Integration
```typescript
import { createWorker } from 'vite-plugin-react-server/worker';
import { createWorkerStream } from 'vite-plugin-react-server/helpers';

const customWorker = createWorker({
  workerPath: 'path/to/custom-worker.js',
  // ... options
});

const workerStream = createWorkerStream({
  worker: customWorker,
  messageType: 'CUSTOM_MESSAGE',
  // ... options
});
```

### Condition-Aware Code
```typescript
import { getCondition } from 'vite-plugin-react-server/config';

const condition = getCondition();

if (condition === 'react-server') {
  // Server-specific code
} else {
  // Client-specific code
}
```

## Best Practices

### 1. Use Package Exports
Always import from the package exports rather than relative paths:

```typescript
// ✅ Good
import { createHandler } from 'vite-plugin-react-server/helpers';

// ❌ Bad
import { createHandler } from './helpers/createHandler.js';
```

### 2. Import Only What You Need
Import specific functions rather than entire modules:

```typescript
// ✅ Good
import { createHandler, createHtmlStream } from 'vite-plugin-react-server/helpers';

// ❌ Bad
import * as helpers from 'vite-plugin-react-server/helpers';
```

### 3. Use TypeScript Types
Import types for better development experience:

```typescript
import { createHandler } from 'vite-plugin-react-server/helpers';
import type { CreateHandlerOptions } from 'vite-plugin-react-server/helpers';

const options: CreateHandlerOptions = {
  // ... options
};
```

### 4. Handle Conditions Properly
Use condition detection for environment-specific code:

```typescript
import { getCondition } from 'vite-plugin-react-server/config';

const condition = getCondition();
const isServer = condition === 'react-server';

// Use condition-aware logic
const handler = isServer ? createDirectHandler() : createWorkerHandler();
```

### 5. Worker Architecture
Understand the difference between RSC and HTML workers:

```typescript
// RSC worker for React Server Components
import 'vite-plugin-react-server/rsc-worker';

// HTML worker for HTML generation
import 'vite-plugin-react-server/html-worker';

// General worker utilities
import { createWorker } from 'vite-plugin-react-server/worker';
```

## Troubleshooting

### Common Import Issues

**Q: Module not found error**
A: Make sure you're using the correct export path from package.json.

**Q: TypeScript errors**
A: Import types from the appropriate module:
```typescript
import type { CreateHandlerOptions } from 'vite-plugin-react-server/helpers';
```

**Q: Worker not working**
A: Ensure you've imported the worker module:
```typescript
import 'vite-plugin-react-server/rsc-worker';
```

### Debugging

Enable verbose logging to debug issues:

```typescript
import { createHandler } from 'vite-plugin-react-server/helpers';

const handler = createHandler({
  ...options,
  verbose: true,
  logger: console,
});
```

### Version Compatibility

Check that you're using compatible versions:

<!-- TOC START -->

## 📚 Documentation Navigation

<!-- Auto-generated TOC - Do not edit manually -->

## Table of Contents

<!-- Auto-generated TOC - Do not edit manually -->


1.	[Getting Started](./getting-started.md)
	- [Installation and Setup](./getting-started.md#installation-and-setup)
	- [Basic Configuration](./getting-started.md#basic-configuration)
	- [Example Projects](./getting-started.md#example-projects)
2.	[Core Concepts](./core-concepts.md)
	- [Client-Server Separation](./core-concepts.md#client-server-separation)
	- [React Server Components](./core-concepts.md#react-server-components)
	- [Plugin Architecture](./core-concepts.md#plugin-architecture)
3.	[Configuration Guide](./configuration.md)
	- [Plugin Options](./configuration.md#plugin-options)
	- [Routing Configuration](./configuration.md#routing-configuration)
	- [Build Configuration](./configuration.md#build-configuration)
4.	[CSS & Styling](./css-handling.md)
	- [CSS Collectors](./css-handling.md#css-collectors)
	- [Inline CSS](./css-handling.md#inline-css)
	- [Custom CSS Processing](./css-handling.md#custom-css-processing)
5.	[Server Actions](./server-actions.md)
	- [Creating Server Actions](./server-actions.md#creating-server-actions)
	- [Client Integration](./server-actions.md#client-integration)
	- [Error Handling](./server-actions.md#error-handling)
	- [Database Integration](./server-actions.md#database-integration)
6.	[Build & Deployment](./build-orchestration.md)
	- [Multiple Build Targets](./build-orchestration.md#multiple-build-targets)
	- [Plugin Architecture](./build-orchestration.md#plugin-architecture)
	- [Environment-Specific Builds](./build-orchestration.md#environment-specific-builds)
7.	[Advanced Development](./advanced-topics.md)
	- [Custom Workers](./advanced-topics.md#custom-workers)
	- [Message System](./advanced-topics.md#message-system)
	- [Extending the Plugin](./advanced-topics.md#extending-the-plugin)
8.	[Plugin Internals](./transformer-plugin.md)
	- [Plugin Architecture](./transformer-plugin.md#plugin-architecture)
	- [Transformation Process](./transformer-plugin.md#transformation-process)
	- [Directive Handling](./transformer-plugin.md#directive-handling)
9.	[Worker System](./rsc-worker.md)
	- [Worker Architecture](./rsc-worker.md#worker-architecture)
	- [Message Handling](./rsc-worker.md#message-handling)
	- [Performance Optimization](./rsc-worker.md#performance-optimization)
10.	[API Reference](./api-reference.md)
	- [Plugin Options](./api-reference.md#plugin-options)
	- [Component Props](./api-reference.md#component-props)
	- [Worker Messages](./api-reference.md#worker-messages)
	- [Type Definitions](./api-reference.md#type-definitions)
11.	[React Compatibility](./react-type-compatibility.md)
	- [Type System Overview](./react-type-compatibility.md#type-system-overview)
	- [Generic Types](./react-type-compatibility.md#generic-types)
	- [Version Compatibility](./react-type-compatibility.md#version-compatibility)
12.	[Troubleshooting](./troubleshooting-guide.md)
	- [Common Issues](./troubleshooting-guide.md#common-issues)
	- [Debugging Tips](./troubleshooting-guide.md#debugging-tips)
	- [Performance Optimization](./troubleshooting-guide.md#performance-optimization)

### Quick Links
- [🏠 Main Documentation](./README.md)
- [🚀 Getting Started](./getting-started.md)
- [📖 GitHub Repository](https://github.com/nicobrinkkemper/vite-plugin-react-server)
- [🎮 Official Demo](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)

---

<!-- TOC END -->





```typescript
import { version } from 'vite-plugin-react-server/package.json';
console.log('Plugin version:', version);
```

 