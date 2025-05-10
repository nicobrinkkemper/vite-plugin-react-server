# Advanced Topics

This document covers advanced topics for the Vite React Server Plugin, including custom workers, the message system, and extending the plugin.

## Custom Workers

The plugin uses a worker-based architecture for processing React Server Components and generating HTML. You can customize these workers to add your own functionality.

### Worker Types

The plugin uses two types of workers:

1. **RSC Worker**: Used by the client plugin to create server-side streams
2. **HTML Worker**: Used by the server plugin to create client-side HTML

### Customizing Workers

You can customize these workers using the `htmlWorkerPath` and `rscWorkerPath` options:

```ts
export const config = {
  // ... other config
  htmlWorkerPath: "./path/to/custom/html-worker.js",
  rscWorkerPath: "./path/to/custom/rsc-worker.js",
};
```

If these paths are defined, they will be used to create the workers instead of the prebuilt workers included with the plugin. These custom workers will be made part of your application build.

### Worker Environment

The workers run in different environments depending on the build mode:

- **Development**: More verbose logging, additional debugging information, stacktraces included in stream
- **Production**: Optimized for performance, minimal logging, no stacktraces in logs 

The worker path is determined by the `NODE_ENV` environment variable:

```ts
htmlWorkerPath: `server/html-worker.${
  process.env["NODE_ENV"] === "production" ? "production" : "development"
}.js`,
```

## Worker Implementation Details

### HTML Worker Implementation

#### Worker Entry Points

The HTML worker has different implementations for development and production environments:

```typescript
// html-worker.ts
await (
    process.env['NODE_ENV'] === 'production' 
      ? import(/* @vite-ignore */'./html-worker.production.js') 
      : import(/* @vite-ignore */'./html-worker.development.js')
);
```

#### Development Worker

The development worker sets up message channels and loaders:

```typescript
// html-worker.development.tsx
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

#### Production Worker

The production worker focuses on message handling and resource management:

```typescript
// html-worker.production.tsx
// Mark shared resources as untransferable
if (workerData && typeof workerData === 'object') {
  Object.values(workerData).forEach(value => {
    if (value && typeof value === 'object') {
      (parentPort as MessagePort & { markAsUntransferable: (obj: any) => void })
        .markAsUntransferable(value);
    }
  });
}

// Set up message handler
parentPort.on("message", (msg) => {
  messageHandler(msg);
});
```

## Message System

The communication between the main process and worker threads is message-based. Understanding this system is essential for creating custom workers.

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
     id: string; // Route identifier
   }
   ```
   - Sent when a route is ready to be processed
   - Worker should initialize render state for this route

2. **RSC_CHUNK**
   ```ts
   interface RscChunkMessage extends BaseMessage {
     type: "RSC_CHUNK";
     id: string; // Route identifier
     chunk: string; // RSC content chunk
   }
   ```
   - Contains a chunk of RSC content
   - Worker should process this chunk and update metrics

3. **RSC_END**
   ```ts
   interface RscEndMessage extends BaseMessage {
     type: "RSC_END";
     id: string; // Route identifier
   }
   ```
   - Signals the end of RSC content for a route
   - Worker should finalize processing and create HTML

4. **CLEANUP**
   ```ts
   interface CleanupMessage extends BaseMessage {
     type: "CLEANUP";
     id: string; // Route identifier
   }
   ```
   - Requests cleanup of resources for a route
   - Worker should destroy streams and remove render state

#### Worker to Main Process Messages

1. **HTML_CHUNK**
   ```ts
   interface HtmlChunkMessage extends BaseMessage {
     type: "HTML_CHUNK";
     id: string; // Route identifier
     chunk: string; // HTML content chunk
   }
   ```
   - Contains a chunk of HTML content
   - Main process should write this to the output stream

2. **HTML_COMPLETE**
   ```ts
   interface HtmlCompleteMessage extends BaseMessage {
     type: "HTML_COMPLETE";
     id: string; // Route identifier
   }
   ```
   - Signals the end of HTML generation
   - Main process should finalize the HTML file

3. **CLEANUP_COMPLETE**
   ```ts
   interface CleanupCompleteMessage extends BaseMessage {
     type: "CLEANUP_COMPLETE";
     id: string; // Route identifier
   }
   ```
   - Confirms cleanup has been completed
   - Main process can release resources

4. **ERROR**
   ```ts
   interface ErrorMessage extends BaseMessage {
     type: "ERROR";
     id: string; // Route identifier
     error: string; // Error message
   }
   ```
   - Reports an error during processing
   - Main process should handle the error and clean up

### Implementing a Custom Worker

To implement your own worker, you need to:

1. **Set up message handling**
   ```ts
   // In your worker file
   import { parentPort } from 'worker_threads';
   
   parentPort.on('message', (message) => {
     // Handle message based on type
     switch (message.type) {
       case 'ROUTE_READY':
         handleRouteReady(message);
         break;
       case 'RSC_CHUNK':
         handleRscChunk(message);
         break;
       // ... handle other message types
     }
   });
   ```

2. **Implement render state management**
   ```ts
   // Track render states for each route
   const renderStates = new Map<string, RenderState>();
   
   interface RenderState {
     rscStream: any; // Your RSC stream implementation
     htmlStream: any; // Your HTML stream implementation
     metrics: {
       chunksReceived: number;
       chunksProcessed: number;
       totalBytes: number;
     };
   }
   ```

3. **Handle RSC processing**
   ```ts
   function handleRscChunk(message: RscChunkMessage) {
     const state = getOrCreateRenderState(message.id);
     
     // Process the RSC chunk
     state.rscStream.write(message.chunk);
     
     // Update metrics
     state.metrics.chunksReceived++;
     state.metrics.totalBytes += message.chunk.length;
   }
   ```

4. **Implement HTML generation**
   ```ts
   function handleRscEnd(message: RscEndMessage) {
     const state = getRenderState(message.id);
     if (!state) return;
     
     // End the RSC stream
     state.rscStream.end();
     
     // Create React component from RSC stream
     const component = createComponentFromRscStream(state.rscStream);
     
     // Set up HTML transform stream
     const htmlStream = createHtmlStream(component);
     
     // Handle HTML chunks
     htmlStream.on('data', (chunk) => {
       parentPort.postMessage({
         type: 'HTML_CHUNK',
         id: message.id,
         chunk
       });
     });
     
     // Handle HTML completion
     htmlStream.on('end', () => {
       parentPort.postMessage({
         type: 'HTML_COMPLETE',
         id: message.id
       });
     });
   }
   ```

5. **Implement cleanup**
   ```ts
   function handleCleanup(message: CleanupMessage) {
     const state = getRenderState(message.id);
     if (!state) return;
     
     // Destroy streams
     state.rscStream.destroy();
     state.htmlStream.destroy();
     
     // Remove render state
     renderStates.delete(message.id);
     
     // Confirm cleanup
     parentPort.postMessage({
       type: 'CLEANUP_COMPLETE',
       id: message.id
     });
   }
   ```

## Worker Best Practices

1. **Environment-Specific Code**: Use separate implementations for development and production to optimize performance and debugging capabilities as well as loaders configuration. Since we build our files to plain javascript for production, you likely don't need loaders for production.

2. **Resource Management**: Always clean up resources properly:
```typescript
function cleanup(id: string) {
  const renderState = activeRenders.get(id);
  if (renderState) {
    renderState.rscStream.destroy();
    renderState.htmlStream?.destroy();
    renderState.htmlTransform?.destroy();
    activeRenders.delete(id);
  }
}
```

3. **Error Handling**: Implement comprehensive error handling and logging:
```typescript
parentPort.on("message", (msg) => {
  console.log('[html-worker] Received message:', JSON.stringify(msg, null, 2));
  messageHandler(msg);
});
```

4. **Performance Monitoring**: Track detailed metrics for debugging and optimization:
```typescript
type StreamMetrics = {
  totalChunksReceived: number;
  totalBytesReceived: number;
  totalChunksProcessed: number;
  totalBytesProcessed: number;
};
```

## Common Worker Issues and Solutions

1. **Memory Leaks**: Always clean up resources using the cleanup function when streams are complete.

2. **Backpressure**: Monitor backpressure events and implement appropriate handling:
```typescript
streamState: {
  backpressureCount: 0,
  drainCount: 0,
  // ... other metrics
}
```

3. **Environment Validation**: Ensure workers run in the correct environment:
```typescript
if (process.env["NODE_ENV"] !== "production") {
  throw new Error("This module must be run in production mode");
}
```

If the html-worker is in production mode the RSC stream created in the main thread should be as well. The worker should send it's initial `READY` signal to communicate its NODE_ENV. 

It's important that the `NODE_ENV` for both the worker thread and main thread are the same. The [createWorker](../plugin/worker/createWorker.ts) module will handle this like so: 
```ts

  await new Promise<Worker>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Worker ready timeout'));
    }, 1000);

    worker.once("message", (msg) => {
      if (msg.type === "READY" && msg.env === process.env['NODE_ENV']) {
        clearTimeout(timeout);
        resolve(worker);
      }
    });

    worker.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
```
When `createWorker` is called it will automatically reverse the current node condition to make the other paradigm of React available. Plugin users can feel free to reuse the plugin's internal modules as long as the react-condition is satisfied. React dependencies will throw an error early whenever the condition isn't satisfied.

The condition `react-server` mostly implicates the output of the module. If the output of the module is consumed by other server depenencies then it should have this condition. If the module only consumes server side input but targets the client side with it's output, then it should explicitly not have the `react-server` condition.

Modules can
  1. explicitly run under `react-server` condition
  2. explititly NOT run under `react-server` condition (we'll call it react-client)
  3. or be agnostic to the condition

The category a module will fall into depends on the React dependencies they import.

REQUIRED `react-server`
- `import * as ReactDOMServer "react-server-dom-esm/server"`

Because it generates RSC streams.

NOT `react-server` (react-client)
- `import * as ReactDOMServer from "react-dom/server";`

You might assume that `react-dom/server` would need the `react-server` condition, because it has server in the name. But since it only consumes server side streams and the output is targetted at the client, it falls into the react-client category.

AGNOSTIC
- `import React, {use, createElement} from "react"`

The `use` feature and React JSX will work regardless of condition.

REQUIRES "use client"
- `import React, {useState} from "react"`
- `<a onClick={function (){/* whatever */}}>`

REQUIRES "use server"
- async server actions / form actions
- The default is server-side rendering, "use client" is the escape hatch


## Extending the Plugin

You can extend the plugin to add your own functionality:

### Custom Plugins

Create a custom plugin that integrates with the Vite React Server Plugin:

```ts
import type { Plugin } from 'vite';
import { 
  type StreamPluginOptions,
  type ResolvedUserOptions,
  type ResolvedUserConfig,
  checkFilesExist,
  resolveOptions,
  resolveUserConfig,
  resolvePages
} from 'vite-plugin-react-server';

let userOptions: ResolvedUserOptions;
let userConfig: resolvedUserConfig;
let files: CheckFilesExistReturn;
let pages: string[];
let isClient = false;
export function myCustomPlugin(options: StreamPluginOptions): Plugin {
  const resolvedOptions = resolveOptions(options, isClient)
  if(resolvedOptions.type === "error"){
    // handle the error
    throw resolvedOptions.error;
  }
  userOptions = resolvedOptions.userOptions;
  return {
    name: 'vite-plugin-react-server-custom',
    // ... implement plugin hooks
    async config(config, configEnv){
      const resolvePagesResult = await resolvePages(userOptions.build.pages);
      if (resolvePagesResult.type === "error") {
        throw resolvePagesResult.error;
      }
      pages = resolvePagesResult.pages;
      files = await checkFilesExist(pages, userOptions, root);
      const resolvedConfig = resolveUserConfig({
        isClient,
        config,
        configEnv,
        userOptions,
        files,
      });
      if (resolvedConfig.type === "error") {
        throw resolvedConfig.error;
      }
      userConfig = resolvedConfig.userConfig;
      // now you're left with the complete config
      // you dont have to return config again when you're already doing so elsewhere
      // but you could
  };
}
```

### Custom React Components

You can provide your own React components for the plugin to use:

```ts
export const config = {
  // ... other config
  Html: MyCustomHtmlComponent,
  CssCollector: MyCustomCssCollector,
};
```

The `CssCollector` component is a single component that can handle both inline and non-inline CSS modes based on the configuration. When `inlineCss` is enabled, the component receives the CSS content directly and can render it as `<style>` tags. When disabled, it renders `<link>` tags instead.

### Custom Build Process

You can customize the build process by creating your own build plugin:

```ts
import type { Plugin } from 'vite';
import type { StreamPluginOptions } from 'vite-plugin-react-server/server';

export function customBuildPlugin(options: StreamPluginOptions): Plugin {
  return {
    name: 'vite-plugin-react-server-custom-build',
    apply: 'build',
    // ... implement build hooks
  };
}
```

## Metrics Collection

The plugin collects various metrics that you can use in your implementation:

```ts
interface StreamMetrics {
  chunksReceived: number;
  chunksProcessed: number;
  totalBytes: number;
  startTime: number;
  endTime?: number;
}

interface RenderMetrics {
  htmlSize: number;
  rscSize: number;
  processingTime: number;
  chunks: number;
  chunkRate: number;
}
```

## Error Handling

Implement comprehensive error handling in your custom workers:

1. **Worker errors**
   ```ts
   worker.on('error', (error) => {
     console.error('Worker error:', error);
     // Handle worker error
   });
   ```

2. **Message errors**
   ```ts
   function handleError(message) {
     const { id, error } = message;
     console.error(`Error processing route ${id}:`, error);
     // Clean up resources
     cleanupResources(id);
   }
   ```

3. **Stream errors**
   ```ts
   stream.on('error', (error) => {
     console.error('Stream error:', error);
     // Handle stream error
   });
   ``` 