# Vite React Transform Plugin

This plugin provides the core transformation functionality for React Server Components (RSC) in Vite. It handles both client and server-side transformations, enabling seamless integration between React Server Components and Vite's build system.

## Module Transformation Strategy

The plugin uses a sophisticated approach to transform modules while preserving their structure. Each loader (client and server) handles BOTH client and server modules, but in their respective environments:

### Environment-Specific Transformations

#### Client Environment Loader
Handles both:
1. Client Modules ("use client")
   - Registers client components for RSC boundaries
   - Preserves client-side functionality

2. Server Modules ("use server")
   - Transforms server actions into client-side references
   - Creates proxies for server function calls
   - Handles server action imports

#### Server Environment Loader
Handles both:
1. Server Modules ("use server")
   - Registers server actions for RSC boundaries
   - Preserves server-side functionality
   - Handles server action imports

2. Client Modules ("use client")
   - Registers client components for RSC boundaries
   - Creates server-side references for client components
   - Ensures proper server-side rendering

### AST-Based Transformation

Both loaders use Abstract Syntax Trees (AST) to:
1. Find the first export declaration
2. Split source code into before/after exports
3. Insert registration code in the right place
4. Preserve original exports

This ensures:
- Imports stay at the top
- Registration code is added in the right place
- Original exports are preserved
- No duplicate exports

### Example Transformations

#### Client Environment

Client Module:
```ts
// Original
"use client"
import { useState } from 'react';
export function Counter() { ... }

// Transformed
"use client"
import { useState } from 'react';

// Register client components
if (typeof Counter === "function") {
  const clientReference = registerClientReference(Counter, "url", "Counter", {...});
  Counter = clientReference;
}

export function Counter() { ... }
```

Server Module:
```ts
// Original
"use server"
export async function add(a: number, b: number) { ... }

// Transformed
"use server"

// Transform server action into client reference
const add = function(...args) {
  const serverReference = registerServerReference("url#add", add);
  return serverReference.apply(null, args);
};
Object.defineProperties(add, {
  $$typeof: { value: Symbol.for("react.server.reference") },
  $$id: { value: "url#add" },
  $$bound: { value: null },
  $$name: { value: "add" }
});

export { add };
```

#### Server Environment

Server Module:
```ts
// Original
"use server"
export async function add(a: number, b: number) { ... }

// Transformed
"use server"

// Register server actions
if (typeof add === "function") {
  const serverReference = registerServerReference(add, "url", "add", {...});
  add = serverReference;
}

export async function add(a: number, b: number) { ... }
```

Client Module:
```ts
// Original
"use client"
import { useState } from 'react';
export function Counter() { ... }

// Transformed
"use client"
import { useState } from 'react';

// Register client components
if (typeof Counter === "function") {
  const clientReference = registerClientReference(Counter, "url", "Counter", {...});
  Counter = clientReference;
}

export function Counter() { ... }
```

### Key Benefits

1. **Environment-Aware Transformations**
   - Each loader handles both module types
   - Transformations are environment-specific
   - Proper RSC boundary handling

2. **Preserves Module Structure**
   - Maintains original import order
   - Keeps exports in their original location
   - Preserves source maps

3. **Handles Complex Cases**
   - Server action imports from .server files
   - Client component registration
   - Proper metadata for RSC boundaries
   - Environment-specific transformations

4. **Avoids Common Pitfalls**
   - No duplicate exports
   - No broken source maps
   - No mangled imports
   - Proper environment isolation

## Usage

When using this plugin, you need to set the `react-server` condition in your Vite configuration:

```json
{ 
    "scripts": {
        "build": "NODE_OPTIONS='--conditions react-server' vite build",
        "dev": "NODE_OPTIONS='--conditions react-server' vite"
    }
}
```

## Architecture

### Environment Separation

The plugin maintains a clear separation between different environments and uses dedicated workers for each scenario:

1. **Client-Side Scenario**
   - Main Thread (Vite)
     - Runs with Vite's default conditions
     - Handles client-side module transformation
     - Manages the client build pipeline
   - HTML Worker Thread
     - Runs in a clean Node environment
     - Handles HTML rendering
     - Uses `react-dom/server` for server-side rendering
     - Uses `react-server-dom-esm/client.node` for client-side RSC
     - Processes static HTML generation

2. **Server-Side Scenario**
   - Main Thread (Vite)
     - Runs with `react-server` condition
     - Handles server-side module transformation
     - Manages the server build pipeline
   - RSC Worker Thread
     - Runs in a clean Node environment
     - Handles RSC streaming
     - Uses `react-server-dom-esm/server.node`
     - Processes server component requests

3. **Browser Environment**
   - Client-side React components
   - Uses `react-dom/client`
   - Handles hydration and client-side updates

### RSC Stream Flow

#### Client-Side Flow
```
Main Thread (Vite)     HTML Worker Thread (Clean Node)        Browser
---------------        ---------------------                 ---------------------
Client Modules →       HTML Rendering                        React Client
                     (react-dom/server)                      (react-dom/client)
                     (react-server-dom-esm/client.node)      (react-server-dom-esm/client.browser)
```

#### Server-Side Flow
```
Main Thread (Vite)     RSC Worker Thread (Clean Node)         Static Output
---------------        ---------------------                 ---------------------
Server Modules →       RSC Streaming                         Static Files
(react-server) →       (react-server-dom-esm/server.node)    (HTML + RSC)
```

## Key Features

1. **Module Transformation**
   - Transforms "use client" and "use server" directives
   - Handles client/server component boundaries
   - Manages module resolution and imports

2. **Request Handling**
   - Processes HTML and directory requests
   - Skips Vite's internal requests
   - Handles static file serving

3. **Module Resolution**
   - Maintains proper import maps for client components
   - Resolves dependencies using Vite's module system
   - Handles bootstrap module resolution

## Common Pitfalls

1. **Environment Conflicts**
   - Don't use `react-dom/server.node` in the main thread
   - Avoid mixing React server/client conditions
   - Keep worker thread environments clean
   - Ensure proper worker thread isolation

2. **Stream Handling**
   - Be careful with stream handling between threads
   - Ensure proper error handling in streams
   - Monitor stream backpressure
   - Handle worker thread communication properly

3. **Module Resolution**
   - Watch for proper module resolution in both environments
   - Ensure consistent module IDs across client/server
   - Handle path normalization correctly
   - Maintain proper module boundaries between workers

## Best Practices

1. **Development**
   - Use the `react-server` condition for development
   - Monitor stream metrics for performance
   - Use proper error boundaries
   - Test both client and server scenarios

2. **Production**
   - Ensure proper build order (client → server → static)
   - Monitor bundle sizes
   - Test RSC boundaries thoroughly
   - Verify worker thread performance

3. **Debugging**
   - Use source maps for debugging
   - Monitor stream metrics
   - Check module resolution paths
   - Debug worker thread issues separately

## Configuration

The plugin can be configured through Vite's plugin system:

```typescript
import { defineConfig } from 'vite';
import { reactTransformPlugin } from './plugin/transformer';

export default defineConfig({
  plugins: [
    reactTransformPlugin({
      // Plugin options
    })
  ]
});
```

## Contributing

When contributing to this plugin:

1. Maintain environment separation
2. Follow the established stream flow
3. Test in all environments
4. Update documentation for changes
5. Consider performance implications
6. Test both worker scenarios
7. Ensure proper worker thread isolation
