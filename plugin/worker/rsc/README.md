# RSC Worker

The RSC worker is used by the client plugin to handle React Server Components when the main thread is running without the `react-server` condition. It provides the server-condition capabilities that the client plugin needs but can't access directly.

> **Part of**: [Vite React Server Plugin](../../../README.md)  
> **Documentation**: [Plugin Architecture Overview](../../../docs/README.md#plugin-architecture-documentation)

## Purpose

The RSC worker serves several key functions:

1. **Server Condition Access**: Enables RSC processing in a client-focused environment
2. **Message-Based Communication**: Handles RSC streaming through a message passing interface
3. **Context Isolation**: Provides a clean environment for server-side React processing
4. **Streaming Support**: Handles RSC chunk processing and streaming responses

## Implementation Details

The worker comes in two variants:

- `rsc-worker.development.ts`: Full implementation with detailed logging and error handling
- `rsc-worker.production.ts`: Optimized implementation for production builds

### Message Types

The worker handles several message types:

- `RSC_RENDER`: Renders React Server Components
- `SERVER_ACTION`: Executes server actions
- `CLEANUP`: Cleans up worker resources

### State Management

The worker maintains state for:
- Active render requests
- Server action handlers
- Streaming connections
- Error boundaries

## Extending the Worker

Users can create their own RSC workers for application-level use. This allows for:

1. Custom RSC processing logic
2. Application-specific message handling
3. Specialized worker architectures

Example of creating a custom RSC worker:

```typescript
import { messageHandler } from 'vite-plugin-react-server/worker/rsc/messageHandler'
import type { RscWorkerMessage } from 'vite-plugin-react-server/worker/types'

// Create your custom message handler
const customMessageHandler = async (msg: RscWorkerMessage) => {
  // Add your custom logic here
  return messageHandler(msg)
}

// Initialize your worker
if (typeof WorkerGlobalScope !== 'undefined') {
  parentPort.on('message', customMessageHandler)
}
```

## ⚠️ Advanced Configuration: Custom Loader Paths

> **Warning**: These are escape hatches for advanced users. Most users should NOT use these options as they can break React Server Components, CSS processing, or environment handling, during the rsc-worker development workflow.

The RSC worker supports custom loader paths that allow you to completely replace the core loading mechanisms:

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";

export default defineConfig({
  plugins: [
    vitePluginReactServer({
      // ⚠️ EXPERIMENTAL: Custom loader paths
      reactLoaderPath: "./custom-loaders/my-react-loader.js",  // Replaces React loading
      cssLoaderPath: "./custom-loaders/my-css-loader.js",      // Replaces CSS processing  
      envLoaderPath: "./custom-loaders/my-env-loader.js",      // Replaces environment handling
      
      // Legacy general loader path (discouraged)
      loaderPath: "./custom-loaders/react-loader.js",
    }),
  ],
});
```

### Custom React Loader Example

```js
// custom-loaders/my-react-loader.js
/**
 * ⚠️ ADVANCED: Custom React loader
 * This replaces the entire React loading mechanism
 * Use at your own risk - may break RSC functionality!
 */

export function load(url, context, nextLoad) {
  if (url === 'react' || url.startsWith('react/')) {
    console.log('🚨 Intercepting React import:', url);
    // Could redirect to different React build, but likely to break RSC
    // return nextLoad('react@experimental', context);
  }
  
  return nextLoad(url, context);
}
```

### Custom CSS Loader Example

```js
// custom-loaders/my-css-loader.js
/**
 * ⚠️ ADVANCED: Custom CSS processing
 * This replaces the built-in CSS handling
 */

export async function load(url, context, nextLoad) {
  if (url.endsWith('.css')) {
    console.log('🎨 Custom CSS processing:', url);
    
    const source = await fetch(url).then(r => r.text());
    const processed = await customCssProcessor(source);
    
    return {
      format: 'module',
      source: `export default ${JSON.stringify(processed)}`,
      shortCircuit: true
    };
  }
  
  return nextLoad(url, context);
}

async function customCssProcessor(css) {
  // Your custom CSS processing logic
  return css.replace(/\/\*.*?\*\//g, ''); // Remove comments
}
```

### Why These May Not Work As Expected

These custom loader paths:

1. **Break RSC Integration**: The plugin expects specific loader behavior for React Server Components to work correctly
2. **Bypass Safety Checks**: Built-in loaders handle React conditions, serialization, and worker communication
3. **Can Cause Compatibility Issues**: Different React builds or processing might break streaming and component registration
4. **Are Undocumented Internal APIs**: These APIs may change without notice and could destabilize the plugin

### Safer Alternatives

Instead of completely replacing loaders, consider these safer customization options:

```typescript
// vite.config.ts - Safer customization
export default defineConfig({
  plugins: [
    vitePluginReactServer({
      // Customize loader behavior safely
      loader: {
        importServerPath: "my-server-imports",
        importClientPath: "my-client-imports", 
        registerServerReferenceName: "myRegisterServer",
        registerClientReferenceName: "myRegisterClient",
      },
      
      // Custom CSS processing
      css: {
        inlineThreshold: 1024,
      },
      
      // Event hooks for monitoring/customization
      onEvent: (event) => {
        if (event.type === 'css.process') {
          console.log('CSS processed:', event.data);
        }
      },
    }),
  ],
});
```

These safer alternatives provide customization without replacing core functionality.

## Future Possibilities

The RSC worker architecture is designed to be extensible. Future enhancements could include:

- Custom streaming strategies
- Advanced caching mechanisms
- Specialized RSC processing pipelines
- Integration with other build tools

## Notes

- The worker must be initialized with appropriate Node conditions
- Message handling must account for streaming data
- Consider memory usage when processing large RSC payloads 

### Example: Restoring Default React Server Components Loader

Here's how you can restore the default `@react-server-dom-esm-node-loader.production.js` behavior as a custom hook:

```javascript
// custom-react-loader.js
import { transformSource } from 'react-server-dom-esm/node-loader';

/**
 * Custom React loader that restores default RSC behavior
 * Just delegates to the official React Server Components loader
 */
export const load = async (url, context, defaultLoad) => {
  // First load the file using the default loader
  const result = await defaultLoad(url, context);
  
  // If it's not a module or source isn't a string, return as-is
  if (result.format !== 'module' || typeof result.source !== 'string') {
    return result;
  }

  // Use the official React Server Components transformSource function
  const transformed = await transformSource(result.source, context, (source, ctx) => ({ source }));
  
  return {
    format: "module",
    source: transformed.source,
    shortCircuit: true
  };
};
```

**Usage:**

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [
    react(),
    reactServer({
      reactLoaderPath: './custom-react-loader.js'
    })
  ]
})
```

This custom loader:
1. **Accepts string source code** (as you mentioned)
2. **Parses for "use client"/"use server" directives**
3. **Transforms client modules** to register client references  
4. **Transforms server modules** to register server references
5. **Maintains the same behavior** as the default React loader

The key requirement you mentioned is correct - the source must be a string, and this loader handles that properly while replicating the core RSC transformation logic.

// ... existing code ... 