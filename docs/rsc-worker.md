# Worker System

This guide covers the worker system implementation, including RSC workers, HTML workers, and worker communication patterns.

> **Note**: In development mode (`dev:rsc`), the RSC worker is **skipped by default**. RSC rendering happens directly on the main thread using Vite's environment runner, which provides proper HMR support. Set `dev.useRscWorker: true` to use the worker in dev mode. See [Configuration Guide](./configuration.md#devuserscworker) for details.

## Worker System

The plugin uses a worker-based system to handle React Server Components processing and HTML generation. This provides isolation, performance benefits, and the ability to run different React conditions in separate environments.

### Worker Types

The plugin uses two main types of workers:

1. **RSC Worker**: Handles React Server Components rendering and server actions
2. **HTML Worker**: Transforms RSC streams to HTML during builds

### Worker Environment

Workers run in different environments depending on the build mode:

- **Development**: More verbose logging, additional debugging information, stacktraces included in stream
- **Production**: Optimized for performance, minimal logging, no stacktraces in logs 

The worker path is determined by the `NODE_ENV` environment variable:

```ts
htmlWorkerPath: `server/html-worker.${
  process.env["NODE_ENV"] === "production" ? "production" : "development"
}.js`,
```

## RSC Worker

The RSC worker is responsible for rendering React Server Components and handling server actions.

### Implementation

```typescript
// rsc-worker.js
import { parentPort } from "worker_threads";
import { renderToReadableStream } from "react-server-dom-esm/server.node";

// Initialize worker
parentPort?.postMessage({
  type: "READY",
  id: "rsc-worker",
  env: process.env.NODE_ENV
});

// Message handler
parentPort?.on("message", async (message) => {
  switch (message.type) {
    case "RSC_RENDER":
      await handleRscRender(message);
      break;
    case "SERVER_ACTION":
      await handleServerAction(message);
      break;
    case "CLEANUP":
      await handleCleanup(message);
      break;
    case "SHUTDOWN":
      await handleShutdown(message);
      break;
  }
});
```

### RSC Rendering

```typescript
async function handleRscRender(message: RscRenderMessage) {
  const { id, element, moduleBaseURL, cssFiles } = message;
  
  try {
    // Create RSC stream
    const stream = renderToReadableStream(element, {
      moduleBaseURL,
      // Additional options...
    });
    
    // Store render state
    renderStates.set(id, { stream, startTime: Date.now() });
    
    // Process stream chunks
    const reader = stream.getReader();
    let sequence = 0;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      // Send chunk to main thread
      parentPort?.postMessage({
        type: "RSC_CHUNK",
        id,
        chunk: value,
        sequence: sequence++
      });
    }
    
    // Signal completion
    parentPort?.postMessage({
      type: "RSC_END",
      id,
      metrics: {
        chunks: sequence,
        duration: Date.now() - renderStates.get(id)!.startTime
      }
    });
    
  } catch (error) {
    // Handle errors
    parentPort?.postMessage({
      type: "ERROR",
      id,
      error: error.message,
      errorInfo: error.errorInfo
    });
  }
}
```

### Server Actions

```typescript
async function handleServerAction(message: ServerActionMessage) {
  const { id, actionId, args } = message;
  
  try {
    // Get action function
    const action = getActionFunction(actionId);
    
    // Execute action
    const result = await action(...args);
    
    // Send result
    parentPort?.postMessage({
      type: "SERVER_ACTION_RESPONSE",
      id,
      result
    });
    
  } catch (error) {
    // Handle errors
    parentPort?.postMessage({
      type: "ERROR",
      id,
      error: error.message
    });
  }
}
```

### Module Loading

The RSC worker registers hooks to support various module types:

```typescript
// Register loaders
import { register } from "vite-plugin-react-server/loader";

// React loader for server components
register("./loaders/react-loader.js", {
  parentURL: import.meta.url,
  data: { condition: "react-server" }
});

// CSS loader for styles
register("./loaders/css-loader.js", {
  parentURL: import.meta.url,
  data: { condition: "react-server" }
});

// Environment loader
register("./loaders/env-loader.js", {
  parentURL: import.meta.url,
  data: { condition: "react-server" }
});
```

## HTML Worker

The HTML worker transforms RSC streams to HTML during static builds.

### Implementation

```typescript
// html-worker.js
import { parentPort } from "worker_threads";
import { renderToPipeableStream } from "react-dom/server";
import { createRscToHtmlStream } from "vite-plugin-react-server/stream-helpers";

// Initialize worker
parentPort?.postMessage({
  type: "READY",
  id: "html-worker",
  env: process.env.NODE_ENV
});

// Message handler
parentPort?.on("message", async (message) => {
  switch (message.type) {
    case "ROUTE_READY":
      await handleRouteReady(message);
      break;
    case "RSC_CHUNK":
      await handleRscChunk(message);
      break;
    case "RSC_END":
      await handleRscEnd(message);
      break;
    case "CLEANUP":
      await handleCleanup(message);
      break;
  }
});
```

### HTML Generation

```typescript
async function handleRouteReady(message: RouteReadyMessage) {
  const { id, moduleRootPath, moduleBaseURL, cssFiles, pipeableStreamOptions } = message;
  
  try {
    // Initialize render state
    renderStates.set(id, {
      moduleRootPath,
      moduleBaseURL,
      cssFiles,
      pipeableStreamOptions,
      chunks: [],
      startTime: Date.now()
    });
    
    // Signal ready
    parentPort?.postMessage({
      type: "ROUTE_READY_ACK",
      id
    });
    
  } catch (error) {
    parentPort?.postMessage({
      type: "ERROR",
      id,
      error: error.message
    });
  }
}

async function handleRscChunk(message: RscChunkMessage) {
  const { id, chunk, sequence } = message;
  const state = renderStates.get(id);
  
  if (!state) {
    parentPort?.postMessage({
      type: "ERROR",
      id,
      error: "No render state found"
    });
    return;
  }
  
  // Store chunk
  state.chunks[sequence] = chunk;
  
  // Signal chunk processed
  parentPort?.postMessage({
    type: "CHUNK_PROCESSED",
    id,
    success: true
  });
}

async function handleRscEnd(message: RscEndMessage) {
  const { id } = message;
  const state = renderStates.get(id);
  
  if (!state) {
    parentPort?.postMessage({
      type: "ERROR",
      id,
      error: "No render state found"
    });
    return;
  }
  
  try {
    // Reconstruct RSC stream
    const rscStream = reconstructRscStream(state.chunks);
    
    // Create HTML stream
    const htmlStream = createRscToHtmlStream({
      rscStream,
      htmlTemplate: state.htmlTemplate,
      cssFiles: state.cssFiles
    });
    
    // Process HTML stream
    const reader = htmlStream.getReader();
    let htmlChunks = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      htmlChunks.push(value);
      
      // Send HTML chunk to main thread
      parentPort?.postMessage({
        type: "HTML_CHUNK",
        id,
        chunk: value,
        encoding: "utf8"
      });
    }
    
    // Signal completion
    parentPort?.postMessage({
      type: "HTML_COMPLETE",
      id,
      success: true,
      html: Buffer.concat(htmlChunks).toString(),
      metrics: {
        chunks: htmlChunks.length,
        duration: Date.now() - state.startTime
      }
    });
    
  } catch (error) {
    parentPort?.postMessage({
      type: "ERROR",
      id,
      error: error.message
    });
  }
}
```

### Development Worker

The development worker sets up message channels and loaders:

```typescript
// html-worker.development.tsx
import { MessageChannel } from "worker_threads";

// Create channels for each loader
const reactLoaderChannel = new MessageChannel();
const cssLoaderChannel = new MessageChannel();

// Listen for messages from loaders
reactLoaderChannel.port2.on("message", messageHandler);
cssLoaderChannel.port2.on("message", messageHandler);

// Register loaders
register(loaderPath, {
  parentURL: pluginRoot,
  data: { port: reactLoaderChannel.port1 },
  transferList: [reactLoaderChannel.port1],
});
```

## Worker Communication

### Message Types

All messages follow this basic structure:

```ts
interface BaseMessage {
  type: string;
  id: string;
}
```

#### Main Process to Worker Messages

1. **ROUTE_READY**
   ```ts
   interface RouteReadyMessage extends BaseMessage {
     type: "ROUTE_READY";
     moduleRootPath: string;
     moduleBaseURL: string;
     cssFiles: CssContent[];
     pipeableStreamOptions: SerializeableRenderToPipeableStreamOptions;
     projectRoot: string;
   }
   ```

2. **RSC_CHUNK**
   ```ts
   interface WorkerRscChunkMessage extends WorkerMessage {
     type: "RSC_CHUNK";
     chunk: ArrayBufferLike;
   }
   ```

3. **RSC_END**
   ```ts
   interface RscEndMessage extends BaseMessage {
     type: "RSC_END";
   }
   ```

4. **CLEANUP**
   ```ts
   interface CleanupMessage extends BaseMessage {
     type: "CLEANUP";
   }
   ```

5. **SHUTDOWN**
   ```ts
   interface ShutdownMessage extends BaseMessage {
     type: "SHUTDOWN";
   }
   ```

#### Worker to Main Process Messages

1. **HTML_CHUNK**
   ```ts
   interface HtmlChunkMessage extends BaseMessage {
     type: "HTML_CHUNK";
     chunk: ArrayBufferLike;
     encoding: string;
   }
   ```

2. **HTML_COMPLETE**
   ```ts
   interface HtmlCompleteMessage extends BaseMessage {
     type: "HTML_COMPLETE";
     success: boolean;
     html?: string;
     chunks?: ArrayBufferLike[];
     metrics?: StreamMetrics;
   }
   ```

3. **CHUNK_PROCESSED**
   ```ts
   interface ChunkProcessedMessage extends BaseMessage {
     type: "CHUNK_PROCESSED";
     success: boolean;
   }
   ```

4. **ERROR**
   ```ts
   interface ErrorMessage extends BaseMessage {
     type: "ERROR";
     error: Error | string;
     errorInfo?: ErrorInfo;
   }
   ```

### Communication Patterns

1. **Initialization Pattern**
   ```ts
   // Worker signals ready
   parentPort?.postMessage({
     type: "READY",
     id: "worker",
     env: process.env.NODE_ENV
   });

   // Main process waits for ready
   worker.once("message", (msg) => {
     if (msg.type === "READY") {
       // Worker is ready
     }
   });
   ```

2. **Error Handling Pattern**
   ```ts
   // Worker sends error
   sendMessage({
     type: "ERROR",
     id,
     error: toError(error),
     errorInfo
   });

   // Main process handles error
   worker.on("message", (msg) => {
     if (msg.type === "ERROR") {
       // Handle error
     }
   });
   ```

3. **Cleanup Pattern**
   ```ts
   // Main process requests cleanup
   worker.postMessage({
     type: "CLEANUP",
     id
   });

   // Worker confirms cleanup
   sendMessage({
     type: "CLEANUP_COMPLETE",
     id
   });
   ```

## Performance Optimization

### Worker Pool Management

```typescript
class WorkerPool {
  private workers: Worker[] = [];
  private available: Worker[] = [];
  private busy: Set<Worker> = new Set();
  
  constructor(size: number, workerPath: string) {
    for (let i = 0; i < size; i++) {
      const worker = new Worker(workerPath);
      this.workers.push(worker);
      this.available.push(worker);
    }
  }
  
  async acquire(): Promise<Worker> {
    if (this.available.length === 0) {
      // Wait for worker to become available
      await new Promise(resolve => {
        const check = () => {
          if (this.available.length > 0) {
            resolve(undefined);
          } else {
            setTimeout(check, 10);
          }
        };
        check();
      });
    }
    
    const worker = this.available.pop()!;
    this.busy.add(worker);
    return worker;
  }
  
  release(worker: Worker) {
    this.busy.delete(worker);
    this.available.push(worker);
  }
}
```

### Memory Management

```typescript
// Clean up streams and render states
function cleanup(id: string) {
  if (renderStates.has(id)) {
    const state = renderStates.get(id);
    state.stream?.cancel();
    renderStates.delete(id);
  }
}

// Monitor memory usage
function monitorMemory() {
  const usage = process.memoryUsage();
  if (usage.heapUsed > 100 * 1024 * 1024) { // 100MB
    // Trigger garbage collection or cleanup
    global.gc?.();
  }
}
```

### Metrics Collection

```typescript
interface WorkerMetrics {
  startTime: number;
  endTime?: number;
  chunks: number;
  bytes: number;
  errors: number;
  duration?: number;
}

const metrics = new Map<string, WorkerMetrics>();

function trackMetrics(id: string, type: 'start' | 'chunk' | 'end' | 'error') {
  if (!metrics.has(id)) {
    metrics.set(id, {
      startTime: Date.now(),
      chunks: 0,
      bytes: 0,
      errors: 0
    });
  }
  
  const metric = metrics.get(id)!;
  
  switch (type) {
    case 'chunk':
      metric.chunks++;
      break;
    case 'end':
      metric.endTime = Date.now();
      metric.duration = metric.endTime - metric.startTime;
      break;
    case 'error':
      metric.errors++;
      break;
  }
}
```

## Error Handling

### Worker Error Boundaries

```typescript
// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  parentPort?.postMessage({
    type: "ERROR",
    id: "worker",
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  parentPort?.postMessage({
    type: "ERROR",
    id: "worker",
    error: `Unhandled rejection: ${reason}`
  });
});
```

### Stream Error Handling

```typescript
const stream = renderToPipeableStream(elements, {
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

## Custom Workers

### Creating Custom RSC Workers

```typescript
// custom-rsc-worker.js
import { parentPort } from "worker_threads";

// Custom RSC processing logic
async function customRscRender(element, options) {
  // Custom rendering logic
  return customRenderToStream(element, options);
}

parentPort?.on("message", async (message) => {
  if (message.type === "RSC_RENDER") {
    const result = await customRscRender(
      message.element,
      message.options
    );
    
    parentPort?.postMessage({
      type: "RSC_RESULT",
      id: message.id,
      result
    });
  }
});
```

### Creating Custom HTML Workers

```typescript
// custom-html-worker.js
import { parentPort } from "worker_threads";

// Custom HTML transformation logic
async function customHtmlTransform(rscStream, options) {
  // Custom transformation logic
  return customTransformToHtml(rscStream, options);
}

parentPort?.on("message", async (message) => {
  if (message.type === "HTML_TRANSFORM") {
    const result = await customHtmlTransform(
      message.rscStream,
      message.options
    );
    
    parentPort?.postMessage({
      type: "HTML_RESULT",
      id: message.id,
      result
    });
  }
});
```

### Worker Configuration

```typescript
export const config = {
  // ... other options
  htmlWorkerPath: "./workers/custom-html-worker.js",
  rscWorkerPath: "./workers/custom-rsc-worker.js",
  workerOptions: {
    maxWorkers: 4,
    workerTimeout: 30000,
    memoryLimit: 512 * 1024 * 1024, // 512MB
  }
};
```

## Testing Workers

### Unit Testing

```typescript
// worker.test.js
import { describe, it, expect } from 'vitest';
import { Worker } from 'worker_threads';

describe('RSC Worker', () => {
  it('should handle RSC rendering', async () => {
    const worker = new Worker('./rsc-worker.js');
    
    const result = await new Promise((resolve, reject) => {
      worker.on('message', resolve);
      worker.on('error', reject);
      
      worker.postMessage({
        type: "RSC_RENDER",
        id: "test",
        element: { type: "div", props: { children: "Hello" } },
        moduleBaseURL: "/"
      });
    });
    
    expect(result.type).toBe("RSC_END");
    worker.terminate();
  });
});
```

### Integration Testing

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
7.	[Advanced Development](./advanced-topics.md)
8.	[Plugin Internals](./transformer-plugin.md)
9.	**[Worker System](./rsc-worker.md) ← you are here**
10.	[API Reference](./api-reference.md)
11.	[React Compatibility](./react-type-compatibility.md)
12.	[Troubleshooting](./troubleshooting-guide.md)
13.	[Package Exports](./package-exports.md)
14.	[Transformations](./transformations.md)

### Quick Links
- [🏠 Main Documentation](./README.md)
- [🚀 Getting Started](./getting-started.md)
- [📖 GitHub Repository](https://github.com/nicobrinkkemper/vite-plugin-react-server)
- [🎮 Official Demo](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)

---

<!-- TOC END -->

