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

10.	**[Advanced Topics](./advanced-topics.md) ← you are here**
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