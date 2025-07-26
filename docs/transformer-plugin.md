# Vite React Transform Plugin

This plugin provides the core transformation functionality for React Server Components (RSC) in Vite. It handles both client and server-side transformations, enabling seamless integration between React Server Components and Vite's build system.

> **Part of**: [Vite React Server Plugin](../../../README.md)  
> **Documentation**: [Plugin Architecture Overview](../../../docs/README.md#plugin-architecture-documentation)

## Key Features

- **Intelligent Directive Validation**: Context-aware validation with specific error messages
- **AST-Based Transformation**: Preserves module structure and source maps
- **Environment-Specific Processing**: Handles both client and server modules appropriately
- **Error Handling Configuration**: Configurable `panicThreshold` for development vs production

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

### Directive Validation

The transformer includes intelligent directive validation with context-aware error detection:

#### Valid Directive Placement
```typescript
// ✅ File-level server directive
"use server";
export async function add(a, b) {
  return a + b;
}

// ✅ File-level client directive  
"use client"
import React from 'react';
export function ClientComponent() { 
  return <div>Interactive</div>; 
}

// ✅ Function-level server directive
export async function add(a, b) {
  "use server";
  return a + b;
}
```

#### Invalid Directive Placement
```typescript
// ❌ Nested function - detected and reported
export function outer() {
  function inner() { 
    "use server"; 
    return 1; 
  }
}

// ❌ Class method - detected and reported
export class Calculator {
  async add(a, b) { 
    "use server"; 
    return a + b; 
  }
}
```

#### Error Handling Configuration
```typescript
// Configure error handling behavior
const config = {
  loader: {
    panicThreshold: 'none' | 'critical_errors' | 'all_errors'
  }
};
```

### AST-Based Transformation

Both loaders use Abstract Syntax Trees (AST) to:
1. Validate directive placement and context
2. Find the first export declaration
3. Split source code into before/after exports
4. Insert registration code in the right place
5. Preserve original exports

This ensures:
- Proper directive validation with helpful error messages
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

1. **Intelligent Directive Validation**
   - Context-aware error detection (nested functions, class methods)
   - Specific, actionable error messages
   - Configurable error handling (`panicThreshold`)
   - Function type detection (arrow functions, class methods, etc.)

2. **Environment-Aware Transformations**
   - Each loader handles both module types
   - Transformations are environment-specific
   - Proper RSC boundary handling

3. **Preserves Module Structure**
   - Maintains original import order
   - Keeps exports in their original location
   - Preserves source maps

4. **Handles Complex Cases**
   - Server action imports from .server files
   - Client component registration
   - Proper metadata for RSC boundaries
   - Environment-specific transformations

5. **Avoids Common Pitfalls**
   - No duplicate exports
   - No broken source maps
   - No mangled imports
   - Proper environment isolation
   - Clear validation errors prevent runtime issues

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

<!-- TOC START -->

## 📚 Documentation Navigation

<!-- Auto-generated TOC - Do not edit manually -->

## Table of Contents

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
10.	[Advanced Topics](./advanced-topics.md)
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
13.	**[Transformer Plugin](./transformer-plugin.md) ← you are here**
	- [Plugin Architecture](./transformer-plugin.md#plugin-architecture)
	- [Transformation Process](./transformer-plugin.md#transformation-process)
	- [Directive Handling](./transformer-plugin.md#directive-handling)
14.	[Loader](./loader.md)
	- [React Server Components Loader](./loader.md#react-server-components-loader)
	- [Directive Processing](./loader.md#directive-processing)
	- [Module Boundaries](./loader.md#module-boundaries)
	- [Custom Registration Functions](./loader.md#custom-registration-functions)
15.	[Custom Loader](./custom-loader.md)
	- [Creating Custom Loaders](./custom-loader.md#creating-custom-loaders)
	- [Loader Configuration](./custom-loader.md#loader-configuration)
	- [Integration Examples](./custom-loader.md#integration-examples)
16.	[RSC Worker](./rsc-worker.md)
	- [Worker Architecture](./rsc-worker.md#worker-architecture)
	- [Message Handling](./rsc-worker.md#message-handling)
	- [Performance Optimization](./rsc-worker.md#performance-optimization)
17.	[HTML Worker](./html-worker.md)
	- [HTML Generation](./html-worker.md#html-generation)
	- [Stream Processing](./html-worker.md#stream-processing)
	- [Worker Communication](./html-worker.md#worker-communication)
18.	[React Type Compatibility](./react-type-compatibility.md)
	- [Type System Overview](./react-type-compatibility.md#type-system-overview)
	- [Generic Types](./react-type-compatibility.md#generic-types)
	- [Version Compatibility](./react-type-compatibility.md#version-compatibility)
19.	[Patch System](./patch-system.md)
	- [React Version Compatibility](./patch-system.md#react-version-compatibility)
	- [Creating Patches](./patch-system.md#creating-patches)
	- [Maintenance Guide](./patch-system.md#maintenance-guide)
20.	[Practical Guide](./practical-guide.md)
	- [Real-world Examples](./practical-guide.md#real-world-examples)
	- [Debugging Features](./practical-guide.md#debugging-features)
	- [Production Implementations](./practical-guide.md#production-implementations)
21.	[Troubleshooting Guide](./troubleshooting-guide.md)
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

