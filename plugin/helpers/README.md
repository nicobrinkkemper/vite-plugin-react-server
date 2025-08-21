# Plugin Helpers

This directory contains reusable helper functions that support the `vite-plugin-react-server` architecture across different environments and contexts.

## Architecture Overview

The plugin supports multiple rendering scenarios:

### Environments
- **Client**: Static generation, build-time rendering
- **Server**: Runtime rendering, SSR

### Contexts  
- **Main Thread**: Direct component access, immediate rendering
- **Worker Thread**: Message-based communication, component loading

### Component Resolution Strategies
- **Direct**: Components passed directly (main thread)
- **From Paths**: Components loaded from file paths (worker thread)
- **Message-based**: Components requested via messages (distributed)

## Core Patterns

### 1. Main Thread vs. Worker Thread
- **Main Thread**: Can access React components directly, immediate rendering
- **Worker Thread**: Must load components from file paths, message-based communication

### 2. Stream Piping
- RSC streams flow from RSC generation to HTML transformation
- Server: RSC Stream → HTML Worker → HTML Stream
- Client: RSC Stream → Main Thread HTML Transform → HTML Stream

### 3. Dual Consumption
- Node.js streams can only be consumed once
- Use `createBufferedRscStream` to allow multiple consumers
- Pattern: Buffer → Multiple Consumers (RSC file + HTML transform)

## Helper Functions

### Message Validation & Processing
- `validateRscRenderMessage()` - Validates RSC render message types
- `resolveRenderUrl()` - Resolves URLs for render operations
- `mergeMessageWithDefaults()` - Merges message values with defaults
- `logRenderStart()` - Consistent logging across render contexts

### Component Resolution
- `resolveComponents()` - Resolves components with fallbacks (main thread)
- `resolveComponentsFromPaths()` - Loads components from file paths (worker thread)

### Stream Handling
- `createBufferedRscStream()` - Creates buffered streams for dual consumption
- `createStreamTimeout()` - Sets up stream timeouts for completion

### Serialization & Communication
- `createSerializableHandlerOptions()` - Extracts serializable parts for worker communication
- `createWorkerMessageTypes()` - Unified message type system
- `createUnifiedRenderHandler()` - Cross-environment render handler

## Usage Examples

### Main Thread Rendering
```typescript
import { createMainThreadRenderHandler } from "../helpers/index.js";

const result = await createMainThreadRenderHandler(
  handlerOptions,
  "client", // or "server"
  { verbose: true, logger }
);
```

### Worker Thread Rendering
```typescript
import { createWorkerThreadRenderHandler } from "../helpers/index.js";

const result = await createWorkerThreadRenderHandler(
  handlerOptions,
  "client", // or "server"
  { verbose: true, logger }
);
```

### Component Resolution in Workers
```typescript
import { resolveComponentsFromPaths } from "../helpers/index.js";

const components = await resolveComponentsFromPaths({
  pagePath: "src/pages/index.tsx",
  rootPath: "src/root.tsx",
  htmlPath: "src/html.tsx",
  pageExportName: "default",
  rootExportName: "Root",
  htmlExportName: "Html",
  logger,
  verbose: true,
});
```

### Buffered Stream for Dual Consumption
```typescript
import { createBufferedRscStream } from "../helpers/index.js";

const bufferedStream = createBufferedRscStream(rscStream, {
  route: "/",
  logger,
  verbose: true,
});

// Can be consumed multiple times
bufferedStream.pipe(rscFileWriter);
bufferedStream.pipe(htmlTransform);
```

## Key Insights

1. **Environment Separation**: Client and server environments have different constraints and capabilities
2. **Thread Model**: Main thread vs. worker thread determines component access patterns
3. **Stream Limitations**: Node.js streams are single-consumer, requiring buffering for dual use
4. **Serialization**: Only serializable data can be passed between threads
5. **Component Loading**: Workers must load components from file paths, not direct references

## Future Improvements

- [ ] Add more comprehensive error handling across all helpers
- [ ] Implement caching for component resolution
- [ ] Add performance metrics collection
- [ ] Create more specialized helpers for specific use cases
- [ ] Improve type safety across all helper functions

