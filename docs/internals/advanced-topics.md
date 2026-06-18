# Advanced Development

This document covers advanced topics for the Vite React Server Plugin, including custom workers, the message system, stream helpers, and extending the plugin.

## Custom Workers

The plugin uses a worker-based system for processing React Server Components and generating HTML. You can customize these workers to add your own functionality.

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

### Development Worker

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
     moduleRootPath: string;
     moduleBaseURL: string;
     cssFiles: CssContent[];
     pipeableStreamOptions: SerializeableRenderToPipeableStreamOptions;
     projectRoot: string;
   }
   ```
   - Sent when a route is ready to be processed
   - Worker should initialize render state for this route
   - Contains configuration for module resolution and CSS handling

2. **RSC_CHUNK**
   ```ts
   interface WorkerRscChunkMessage extends WorkerMessage {
     type: "RSC_CHUNK";
     chunk: ArrayBufferLike;
   }
   ```
   - Contains a chunk of RSC content
   - Worker should process this chunk and update metrics
   - Sequence number helps maintain order of chunks

3. **RSC_END**
   ```ts
   interface RscEndMessage extends BaseMessage {
     type: "RSC_END";
   }
   ```
   - Signals the end of RSC content for a route
   - Worker should finalize processing and create HTML

4. **CLEANUP**
   ```ts
   interface CleanupMessage extends BaseMessage {
     type: "CLEANUP";
   }
   ```
   - Requests cleanup of resources for a route
   - Worker should destroy streams and remove render state

5. **SHUTDOWN**
   ```ts
   interface ShutdownMessage extends BaseMessage {
     type: "SHUTDOWN";
   }
   ```
   - Requests worker shutdown
   - If id is "*", clean up all render states
   - Worker should send SHUTDOWN_COMPLETE when done

#### Worker to Main Process Messages

1. **HTML_CHUNK**
   ```ts
   interface HtmlChunkMessage extends BaseMessage {
     type: "HTML_CHUNK";
     chunk: ArrayBufferLike;
     encoding: string;
   }
   ```
   - Contains a chunk of HTML content
   - Main process should write this to the output stream

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
   - Signals the end of HTML generation
   - Includes success status and optional metrics
   - Main process should finalize the HTML file

3. **CHUNK_PROCESSED**
   ```ts
   interface ChunkProcessedMessage extends BaseMessage {
     type: "CHUNK_PROCESSED";
     success: boolean;
   }
   ```
   - Confirms processing of an RSC chunk
   - Used for tracking progress and error handling

4. **ERROR**
   ```ts
   interface ErrorMessage extends BaseMessage {
     type: "ERROR";
     error: Error | string;
     errorInfo?: ErrorInfo;
   }
   ```
   - Reports an error during processing
   - Includes error details and optional React error info
   - Main process should handle the error and clean up

### Development Mode Messages

1. **HMR Messages**
   ```ts
   interface HmrUpdateMessage extends BaseMessage {
     type: "HMR_UPDATE";
     id: string;
     timestamp?: number;
     routes?: string[];
   }

   interface HmrAcceptMessage extends BaseMessage {
     type: "HMR_ACCEPT";
     id: string;
     routes?: string[];
   }

   interface HmrCleanupMessage extends BaseMessage {
     type: "HMR_CLEANUP";
     id: string;
     routes?: string[];
   }
   ```
   - Used for Hot Module Replacement
   - Handles module updates, acceptance, and cleanup
   - Includes route information for targeted updates

2. **Loader Messages**
   ```ts
   interface InitializedReactLoaderMessage extends BaseMessage {
     type: "INITIALIZED_REACT_LOADER";
   }

   interface InitializedCssLoaderMessage extends BaseMessage {
     type: "INITIALIZED_CSS_LOADER";
   }

   interface InitializedEnvLoaderMessage extends BaseMessage {
     type: "INITIALIZED_ENV_LOADER";
   }
   ```
   - Signal initialization of various loaders
   - Used for module loading and environment setup

### Server Action Messages

1. **Server Action Request**
   ```ts
   interface ServerActionMessage extends BaseMessage {
     type: "SERVER_ACTION";
     args: unknown[];
   }
   ```
   - Used to invoke server actions
   - Contains action arguments

2. **Server Action Response**
   ```ts
   interface ServerActionResponseMessage extends BaseMessage {
     type: "SERVER_ACTION_RESPONSE";
     result: unknown;
     error?: string;
   }
   ```
   - Contains server action results
   - Includes error information if action failed

### Worker Communication Patterns

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

### Best Practices

1. **Message Validation**
   - Always validate message types and required fields
   - Use TypeScript interfaces for type safety
   - Handle unknown message types gracefully

2. **Resource Management**
   - Clean up resources when receiving CLEANUP or SHUTDOWN messages
   - Use try/catch blocks for error handling
   - Implement proper stream cleanup

3. **Error Handling**
   - Always include error details in ERROR messages
   - Handle both synchronous and asynchronous errors
   - Implement proper error recovery mechanisms

4. **Performance Monitoring**
   - Track metrics for RSC and HTML generation
   - Monitor worker memory usage
   - Implement proper cleanup to prevent memory leaks

## Stream Helpers

The plugin provides stream helper utilities for working with React Server Components streams.

### Overview

Stream helpers provide a simple interface for creating and managing RSC streams:

```typescript
import { createRscStream, createHtmlStream } from "vite-plugin-react-server/stream-helpers";

// Create RSC stream
const rscStream = createRscStream({
  element: <MyComponent />,
  moduleBaseURL: "/",
  cssFiles: new Map(),
});

// Create HTML stream
const htmlStream = createHtmlStream({
  rscStream,
  htmlTemplate: "<!DOCTYPE html><html><body><div id='root'></div></body></html>",
});
```

### Implementation

Stream helpers are built on top of React's streaming APIs:

```typescript
// Core stream creation
export function createRscStream(options: RscStreamOptions): ReadableStream {
  const { element, moduleBaseURL, cssFiles } = options;
  
  return renderToReadableStream(element, {
    moduleBaseURL,
    // Additional options...
  });
}

// HTML transformation
export function createHtmlStream(options: HtmlStreamOptions): ReadableStream {
  const { rscStream, htmlTemplate } = options;
  
  return new ReadableStream({
    start(controller) {
      // Transform RSC to HTML
    }
  });
}
```

### API Reference

#### createRscStream

Creates a React Server Components stream:

```typescript
interface RscStreamOptions {
  element: React.ReactElement;
  moduleBaseURL: string;
  cssFiles?: Map<string, CssContent>;
  pipeableStreamOptions?: RenderToPipeableStreamOptions;
}

function createRscStream(options: RscStreamOptions): ReadableStream;
```

#### createHtmlStream

Transforms RSC stream to HTML:

```typescript
interface HtmlStreamOptions {
  rscStream: ReadableStream;
  htmlTemplate?: string;
  cssFiles?: Map<string, CssContent>;
}

function createHtmlStream(options: HtmlStreamOptions): ReadableStream;
```

#### createRscToHtmlStream

Combines RSC and HTML creation:

```typescript
interface RscToHtmlStreamOptions {
  element: React.ReactElement;
  htmlTemplate?: string;
  moduleBaseURL: string;
  cssFiles?: Map<string, CssContent>;
}

function createRscToHtmlStream(options: RscToHtmlStreamOptions): ReadableStream;
```

### Usage Examples

#### Basic RSC Stream

```typescript
import { createRscStream } from "vite-plugin-react-server/stream-helpers";

const stream = createRscStream({
  element: <MyPage />,
  moduleBaseURL: "/",
});

// Use the stream
const reader = stream.getReader();
const chunks = [];
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  chunks.push(value);
}
```

#### HTML Transformation

```typescript
import { createHtmlStream } from "vite-plugin-react-server/stream-helpers";

const htmlStream = createHtmlStream({
  rscStream: myRscStream,
  htmlTemplate: `
    <!DOCTYPE html>
    <html>
      <head>
        <title>My App</title>
      </head>
      <body>
        <div id="root"></div>
      </body>
    </html>
  `,
});
```

#### Combined Stream

```typescript
import { createRscToHtmlStream } from "vite-plugin-react-server/stream-helpers";

const stream = createRscToHtmlStream({
  element: <MyPage />,
  moduleBaseURL: "/",
  htmlTemplate: "<!DOCTYPE html><html><body><div id='root'></div></body></html>",
});
```

#### Custom CSS Handling

```typescript
import { createRscStream } from "vite-plugin-react-server/stream-helpers";

const cssFiles = new Map([
  ["styles.css", { href: "/styles.css", rel: "stylesheet" }],
  ["inline.css", { content: "body { margin: 0; }", as: "style" }],
]);

const stream = createRscStream({
  element: <MyPage />,
  moduleBaseURL: "/",
  cssFiles,
});
```

### Error Handling

Stream helpers include comprehensive error handling:

```typescript
import { createRscStream } from "vite-plugin-react-server/stream-helpers";

try {
  const stream = createRscStream({
    element: <MyPage />,
    moduleBaseURL: "/",
  });
  
  // Handle stream errors
  stream.catch(error => {
    console.error("Stream error:", error);
  });
} catch (error) {
  console.error("Creation error:", error);
}
```

### Performance Optimization

Stream helpers are optimized for performance:

- **Lazy Evaluation**: Streams are created on-demand
- **Memory Efficiency**: Minimal memory footprint during streaming
- **Backpressure Handling**: Proper backpressure management
- **Resource Cleanup**: Automatic cleanup of resources

## Worker Best Practices

1. **Environment-Specific Code**: Use separate implementations for development and production to optimize performance and debugging capabilities as well as loaders configuration. Since we build our files to plain javascript for production, you likely don't need loaders for production.

2. **Resource Management**: Always clean up resources properly:

```typescript
// Clean up streams and render states
function cleanup(id: string) {
  if (renderStates.has(id)) {
    const state = renderStates.get(id);
    state.stream?.cancel();
    renderStates.delete(id);
  }
}
```

3. **Error Boundaries**: Implement proper error boundaries in workers:

```typescript
process.on('uncaughtException', (error) => {
  sendMessage({
    type: "ERROR",
    id: "worker",
    error: error.message,
  });
  process.exit(1);
});
```

4. **Performance Monitoring**: Track metrics and performance:

```typescript
const metrics = {
  startTime: Date.now(),
  chunks: 0,
  bytes: 0,
};

// Update metrics during processing
metrics.chunks++;
metrics.bytes += chunk.byteLength;
```

## Extending the Plugin

### Custom Transformers

You can extend the plugin with custom transformers:

```typescript
import { defineConfig } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";

export default defineConfig({
  plugins: [
    vitePluginReactServer(config),
    {
      name: "custom-transformer",
      transform(code, id) {
        // Custom transformation logic
        return code;
      },
    },
  ],
});
```

### Custom Loaders

Create custom loaders for specific file types:

```typescript
// custom-loader.js
export function customLoader(url, context, nextLoad) {
  if (url.endsWith('.custom')) {
    return {
      format: 'module',
      source: 'export default "custom content";',
    };
  }
  return nextLoad(url, context);
}
```

### Custom Workers

Implement custom workers for specialized processing:

```typescript
// custom-worker.js
import { parentPort } from "worker_threads";

parentPort?.on("message", (message) => {
  switch (message.type) {
    case "CUSTOM_PROCESS":
      // Custom processing logic
      parentPort?.postMessage({
        type: "CUSTOM_RESULT",
        id: message.id,
        result: "processed",
      });
      break;
  }
});
```

### Plugin Composition

Compose multiple plugins for complex workflows:
