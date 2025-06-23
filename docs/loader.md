# React Server Components Loader

The loader implements the `use server` and `use client` directives according to the [React Server Components specification](https://react.dev/reference/rsc/server-components).

- Directive: ['use server'](https://react.dev/reference/rsc/use-server)
- Directive: ['use client'](https://react.dev/reference/rsc/use-client)

## `use server` Directive

The `use server` directive can be used in two ways:

1. At the top of a file to mark all exports as server functions:
```typescript
"use server";

export async function add(a: number, b: number) {
  return a + b;
}

export class Calculator {
  divide(a: number, b: number) {
    return a / b;
  }
}
```

2. On individual functions to mark them as server functions:
```typescript
export async function add(a: number, b: number) {
  "use server";
  return a + b;
}
```

The loader will:
- Register all exports with `registerServerReference` when the file has a top-level `use server` directive
- Register individual functions when they have their own `use server` directive
- Preserve the original source code in source maps for debugging
- Handle both function and class exports appropriately

## `use client` Directive

The `use client` directive marks a module and its transitive dependencies as client code:

```typescript
"use client";

import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

The loader will:
- Mark the module as a client component
- Register all exports with `registerClientReference`
- Ensure proper serialization of props and state

## Module Boundaries

The loader enforces React's module boundary semantics:
- Server Components can import and use Client Components
- Client Components can receive Server Functions as props
- All code in a `use client` module's sub-tree is sent to and run by the client
- Server Components are the default and can access server-only features

### Function Registration in Server Modules

When a module has a top-level `use server` directive, all exported functions are registered as server references:

```typescript
// actions.js
"use server"
export async function add(a: number, b: number) { return a + b }
export const util = { max: (a, b) => Math.max(a, b) }

// The transformed code will register both functions:
// registerServerReference(add, "actions.js", "add")
// registerServerReference(util.max, "actions.js", "util.max")
```

This registration happens even for functions that were imported from other modules:

```typescript
// utils.js (no directives)
export function multiply(a: number, b: number) { return a * b }

// server.js
"use server"
export * from './utils.js'  // multiply will be registered as a server reference
// The transformed code will register multiply:
// registerServerReference(multiply, "server.js", "multiply")
```

The loader checks if each export is a function before registering it:
```typescript
// server.js
"use server"
export const data = { value: 42 }  // Not a function, won't be registered
export function action() { ... }   // Is a function, will be registered
export * from './utils.js'         // Only functions will be registered

// The transformed code:
// registerServerReference(action, "server.js", "action")
// if (typeof multiply === "function") registerServerReference(multiply, "server.js", "multiply")
```

This ensures that any function exported from a server module is properly registered as a server reference, regardless of where it was originally defined. Non-function exports are left unchanged.

### Export * Handling

When handling `export *` statements from client modules, the loader needs special handling because of how client modules are transformed:

```typescript
// client.js
"use client"
export function Button() { ... }
export const theme = { color: 'blue' }  // non-function export

// normal.js (no directives, so server by default)
import { theme } from './client.js'  // This works! theme is just data
export * from './client.js'  // This works! Both Button and theme

// server.js
"use server"
export * from './client.js'  // This only gets the registered functions
```

The issue is:
1. When a client module is loaded under server conditions, it gets transformed to only expose registered functions
2. But under normal (non-server) conditions, we should be able to access all exports, including non-function exports
3. The `export *` needs to work differently depending on whether it's in a server component or not

This is why the loader needs to:
1. Resolve the original client module source when not under server conditions
2. Only use the transformed version (with registered functions) when under server conditions
3. Handle `export *` appropriately based on the context it's used in

## Implementation Details

### Source Maps

The loader preserves the original source code in source maps, including directives, to ensure proper debugging. This means that even though directives are removed from the transformed code, they remain visible in the source maps.

### Registration

The loader uses two main registration functions:

1. `registerServerReference` - For server functions and classes
2. `registerClientReference` - For client components

These functions ensure proper serialization and boundary enforcement between server and client code. The loader is designed to be flexible with its "flight bindings" - while it defaults to using react-server-dom-esm, you can configure it to use different bindings. This allows your bundled server code to run on different platforms like NextJS, Parcel, or plain webpack applications.

### Configuration

The loader can be configured with serializable options. Here's how to customize the transformation pipeline:

```typescript
import { defineConfig } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";

export default defineConfig({
  plugins: vitePluginReactServer({
    // ... other options ...
    rscLoader: {
      // development: configuration unchanged
      // test: configuration unchanged
      production: {
        // Different import paths for production
        serverImport: "react-server-dom-webpack/server",
        clientImport: "react-server-dom-webpack/client",
        registerServerReference: "registerServerReference",
        registerClientReference: "registerClientReference"
      }
    }
  })
});
```

This will only use webpack during build. You need to install this dependency for the
static generation to work, other than that you can develop the app like normal.

This configuration allows you to:
- Switch between different binding implementations
- Keep configuration serializable for worker communication
- Prevent "poisoned entries" during test and development (by adding .node extension)
- Quickly test with different settings

The transformed code will use these imports and function names:

```typescript
// Example of transformed code with "test" config
import { registerServerReference } from "react-server-dom-esm/server.node";

export async function add(a: number, b: number) {
  return a + b;
}

registerServerReference(add, "test.js", "add");
```


#### Modern Architecture

The loader can run either as part of the Vite plugin system directly or in a dedicated worker thread, communicating its operations to a centralized message handler:

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";

export default defineConfig({
  plugins: vitePluginReactServer({
    // Run in worker thread
    rscWorkerPath: "./workers/rsc.js",
    // Or run directly in plugin
    loaderPath: "./loader/react-loader.js",
    // Track events and metrics
    onEvent: (event) => {
      console.log(`[Loader] ${event.type}:`, event);
    },
    onMetrics: (metrics) => {
      console.log(`[Loader] Transform time: ${metrics.transformTime}ms`);
      console.log(`[Loader] Memory usage: ${metrics.memoryUsage}MB`);
    }
  })
});
```

#### Transparency and Debugging

The loader provides detailed information about its operations:

```typescript
// Example of a transformation result
const result = transformer(source, "test.js", true, false);
console.log(result);
// {
//   code: 'import { registerServerReference } from "react-server-dom-esm/server";\n...',
//   map: {
//     version: 3,
//     sources: ["test.js"],
//     mappings: "...",
//     sourcesContent: [original source with directives]
//   },
//   directives: {
//     hasServerDirective: true,
//     hasClientDirective: false,
//     directiveRanges: [...]
//   }
// }
```

### Development vs Production

During development, you might want to:
- Use ESM bindings for faster development cycles
- Test with different binding implementations
- Debug binding-specific issues

For production, you might want to:
- Use platform-specific bindings (e.g., webpack for NextJS)
- Optimize for your target environment
- Ensure compatibility with your deployment platform

The configuration system allows you to specify different bindings for development and production, making it easier to test and migrate between different implementations. Since we only support ESM, the final module format will be handled by your target build tool.

### Error Handling

The loader provides clear error messages for:
- Invalid directive placement
- Missing exports
- Serialization errors
- Boundary violations

### Directive Handling

The loader detects and validates directives in your code, providing clear feedback in development:

```typescript
// actions.ts
"use server";

// Valid: File-level directive
export async function add(a: number, b: number) {
  return a + b;
}

// Invalid: Directive after non-directive statement
const x = 1;
"use server"; // ⚠️ Directive must be at the top of the file, before any other statements

// Invalid: Directive in class method
class Calculator {
  add(a: number, b: number) {
    "use server"; // ⚠️ 'use server' directive must be at the top of the function 'add'. Move it before any other statements
    return a + b;
  }
}

// Invalid: Mixed directives
"use client";
"use server"; // ⚠️ Cannot use both 'use client' and 'use server' directives in the same file. Choose one based on where the code will run
```

Development output shows warnings with source context:
```
⚠️ Directive Error in actions.ts:4:1
Directive must be at the top of the file, before any other statements
const x = 1;
"use server"; // ⚠️ Directive must be at the top of the file, before any other statements
      ~~~~~~~

⚠️ Directive Error in actions.ts:8:5
'use server' directive must be at the top of the function 'add'. Move it before any other statements
  "use server"; // ⚠️ 'use server' directive must be at the top of the function 'add'
  ~~~~~~~~~~~~

⚠️ Directive Error in actions.ts:15:1
Cannot use both 'use client' and 'use server' directives in the same file. Choose one based on where the code will run
"use server"; // ⚠️ Cannot use both 'use client' and 'use server' directives
~~~~~~~~~~~~
```

### Custom Registration Functions

To create your own registration functions, you need to define them in a separate module that follows the React Server Components protocol:

```typescript
// my-registration.js
const SERVER_REFERENCE_TAG = Symbol.for("react.server.reference");
const CLIENT_REFERENCE_TAG = Symbol.for("react.client.reference");

export function registerServerReference(reference, id, exportName) {
  return Object.defineProperties(reference, {
    $$typeof: { value: SERVER_REFERENCE_TAG },
    $$id: { value: id + "#" + exportName, configurable: true },
    $$bound: { value: null, configurable: true },
    bind: { 
      value: function bind(thisArg, ...args) {
        const boundFn = reference.bind(thisArg, ...args);
        Object.defineProperties(boundFn, {
          $$typeof: { value: SERVER_REFERENCE_TAG },
          $$id: { value: id + "#" + exportName, configurable: true },
          $$bound: { value: args, configurable: true }
        });
        return boundFn;
      },
      configurable: true 
    }
  });
}

export function registerClientReference(reference, id, exportName) {
  return Object.defineProperties(reference, {
    $$typeof: { value: CLIENT_REFERENCE_TAG },
    $$id: { value: id + "#" + exportName, configurable: true },
    $$async: { value: true, configurable: true }
  });
}
```

Then configure the loader to use your registration functions:

```typescript
import { defineConfig } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { join } from "path";

export default defineConfig({
  plugins: vitePluginReactServer({
    // Point to your custom registration module
    loaderPath: join(__dirname, "my-registration.js"),
    rscLoader: {
      development: {
        serverImport: "./my-registration.js",
        clientImport: "./my-registration.js",
        registerServerReference: "registerServerReference",
        registerClientReference: "registerClientReference"
      },
      production: {
        serverImport: "./my-registration.js",
        clientImport: "./my-registration.js",
        registerServerReference: "registerServerReference",
        registerClientReference: "registerClientReference"
      }
    }
  })
});
```

This allows you to:
- Implement custom serialization logic
- Add additional metadata to server and client references
- Integrate with different RSC implementations
- Debug function registration
- Quickly test with different settings
- Prevent "poisoned entries" during test and development

## Examples

### Server Action with Class Methods

```
