# Custom React Loader
The plugin provides extensive customization options for how React directives are processed and transformed. This allows you to integrate with different React Server Components implementations, customize registration functions, and adapt the loader to your specific needs.

> Disclaimer: the examples given here have not been tested nor verified that it is possible to use for such use-cases. It's mostly just about the strings that are used during the transformations.

## Overview

The custom loader system allows you to:

- **Use different RSC implementations** (webpack, turbopack, custom)
- **Customize import paths** for registration functions
- **Override directive detection patterns** 
- **Configure environment-specific behavior**
- **Add custom validation logic**

## Basic Configuration

### Custom Import Paths

The most common customization is changing where registration functions are imported from:

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";

export default defineConfig({
  plugins: vitePluginReactServer({
    loader: {
      // Use webpack-based RSC implementation
      importServerPath: "react-server-dom-webpack/server",
      importClientPath: "react-server-dom-webpack/client",
      
      // Or use turbopack
      // importServerPath: "react-server-dom-turbopack/server",
      // importClientPath: "react-server-dom-turbopack/client",
    }
  }),
});
```

### Custom Registration Function Names

Some RSC implementations use different function names:

```typescript
export default defineConfig({
  plugins: vitePluginReactServer({
    loader: {
      registerServerReferenceName: "createServerReference",
      registerClientReferenceName: "createClientReference",
    }
  }),
});
```

## Environment-Specific Configuration

The loader automatically adapts to different environments, but you can override this:

```typescript
export default defineConfig({
  plugins: vitePluginReactServer({
    loader: {
      mode: "development", // or "production" | "test"
      
      // Development uses .node extensions for better debugging
      importServerPath: "react-server-dom-esm/server.node",
      importClientPath: "react-server-dom-esm/server.node",
    }
  }),
});
```

**Default Environment Behavior:**
- **Development**: Uses `.node` extensions for better error messages
- **Production**: Uses standard paths for optimal bundling
- **Test**: Uses `.node` extensions for consistent testing

## Advanced Customization

### Custom Directive Detection

You can customize how the loader detects server and client code:

```typescript
export default defineConfig({
  plugins: vitePluginReactServer({
    loader: {
      // Custom patterns for detecting server/client code
      isServerFunctionCode: (code: string, moduleId?: string) => {
        // Custom logic for detecting server functions
        return code.includes('"use server"') || 
               moduleId?.includes('.server.') ||
               moduleId?.includes('/api/');
      },
      
      isClientComponentCode: (code: string, moduleId?: string) => {
        // Custom logic for detecting client components
        return code.includes('"use client"') ||
               moduleId?.includes('.client.') ||
               moduleId?.includes('/components/');
      },
    }
  }),
});
```

### Next.js Compatibility

Configure the loader to work with Next.js RSC:

```typescript
export default defineConfig({
  plugins: vitePluginReactServer({
    loader: {
      importServerPath: "react-server-dom-webpack/server.edge",
      importClientPath: "react-server-dom-webpack/client.edge",
      registerServerReferenceName: "registerServerReference",
      registerClientReferenceName: "registerClientReference",
      
      // Next.js uses different patterns
      isServerFunctionCode: (code, moduleId) => {
        return code.includes('"use server"') || 
               moduleId?.endsWith('.server.js') ||
               moduleId?.includes('/app/') && !moduleId?.includes('/components/');
      },
    }
  }),
});
```

### Remix Integration

For Remix-style server functions:

```typescript
export default defineConfig({
  plugins: vitePluginReactServer({
    loader: {
      importServerPath: "react-server-dom-esm/server",
      importClientPath: "react-server-dom-esm/client",
      
      // Remix patterns
      isServerFunctionCode: (code, moduleId) => {
        return code.includes('"use server"') ||
               moduleId?.includes('.server.') ||
               moduleId?.includes('/routes/') && code.includes('export async function');
      },
    }
  }),
});
```

### Custom RSC Implementation

For your own RSC implementation:

```typescript
export default defineConfig({
  plugins: vitePluginReactServer({
    loader: {
      importServerPath: "./lib/my-rsc/server",
      importClientPath: "./lib/my-rsc/client",
      registerServerReferenceName: "createServerAction",
      registerClientReferenceName: "createClientComponent",
      
      // Custom validation
      isServerFunctionCode: (code, moduleId) => {
        // Your custom logic here
        return code.includes('@server') || moduleId?.includes('_server');
      },
    }
  }),
});
```

## Transformation Examples

### Example Transformations

The loader transforms modules differently depending on the **environment** (client vs server):

#### Server Environment

**Client Component (becomes error-throwing stub):**
```typescript
// Input: Counter.client.tsx
"use client";
export function Counter() { return <div>count</div>; }

// Output: Error-throwing client reference
import { registerClientReference } from "react-server-dom-esm/server";
export const Counter = registerClientReference(function() { throw new Error("Attempted to call Counter() from the server but Counter is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component."); }, "Counter.client.tsx", "Counter");
```

**Server Action (stays as-is with registration):**
```typescript
// Input: actions.server.ts
"use server";
export async function createUser(data: FormData) {
  return { success: true };
}

// Output: Registered server function
import { registerServerReference } from "react-server-dom-esm/server";

export async function createUser(data: FormData) {
  return { success: true };
}

registerServerReference(createUser, "/actions.server.js", "createUser");
```

#### Client Environment

**Client Component (runs as-is):**
```typescript
// Input: Counter.client.tsx  
"use client";
export function Counter() { return <div>count</div>; }

// Output: Removed directive
export function Counter() { return <div>count</div>; }
```

**Server Action do not exist on client:**
```typescript
// Input: actions.server.ts
"use server";
export async function createUser(data: FormData) {
  return { success: true };
}

// Output: nothing
```
**Non-client components do not exist on client**
```typescript
// Input: page.tsx
export const Page = () => {
  return null;
};
```

// Output: nothing
```

## Testing Custom Loaders

Create test configurations for different scenarios:

```typescript
// test/custom-loader.test.ts
import { createTransformer } from "vite-plugin-react-server/loader";

const customLoaderConfig = {
  importServerPath: "my-custom-rsc/server",
  importClientPath: "my-custom-rsc/client",
  registerServerReferenceName: "myRegisterServer",
  registerClientReferenceName: "myRegisterClient",
  mode: "test",
};

const transformer = createTransformer({ 
  options: { 
    loader: customLoaderConfig,
    verbose: false 
  }
});

// Test your custom configuration
const result = await transformer(code, "test.ts");
expect(result.code).toContain('my-custom-rsc/server');
```

## Debugging Custom Loaders

Enable verbose logging to debug loader behavior:

```typescript
export default defineConfig({
  plugins: vitePluginReactServer({
    verbose: true, // Enable detailed logging
    loader: {
      // Your custom configuration
    }
  }),
});
```

This will output detailed information about:
- Module resolution
- Directive detection
- Transformation steps
- Registration function calls

The verbose option is useful for:
- You want to get a sense of the flow of the application quickly
- You need to share debug information via text

## Common Patterns

### File-Based Routing

Automatically detect server/client based on file structure:

```typescript
loader: {
  isServerFunctionCode: (code, moduleId) => {
    return code.includes('"use server"') ||
           moduleId?.includes('/api/') ||
           moduleId?.includes('/server/') ||
           moduleId?.endsWith('.server.ts');
  },
  
  isClientComponentCode: (code, moduleId) => {
    return code.includes('"use client"') ||
           moduleId?.includes('/components/') ||
           moduleId?.includes('/ui/') ||
           moduleId?.endsWith('.client.tsx');
  },
}
```

### Monorepo Support

Handle different packages in a monorepo:

```typescript
loader: {
  isServerFunctionCode: (code, moduleId) => {
    return code.includes('"use server"') ||
           moduleId?.includes('packages/server/') ||
           moduleId?.includes('apps/api/');
  },
  
  isClientComponentCode: (code, moduleId) => {
    return code.includes('"use client"') ||
           moduleId?.includes('packages/ui/') ||
           moduleId?.includes('apps/web/');
  },
}
```

## Error Handling

Custom loaders should handle errors gracefully:

```typescript
loader: {
  parse: async (source: string) => {
    try {
      // Your custom parsing logic
      return { ast, code, map };
    } catch (error) {
      console.error('Custom parser error:', error);
      // Fallback to default parser
      throw error;
    }
  }
}
```

## Performance Considerations

- **Caching**: Custom detection functions are called frequently - keep them fast
- **Regex Patterns**: Pre-compile regex patterns outside the functions
- **File System**: Avoid file system operations in detection functions

```typescript
// ✅ Good: Pre-compiled patterns
const SERVER_PATTERN = /\.(server|api)\./;
const CLIENT_PATTERN = /\.(client|component)\./;

loader: {
  isServerFunctionCode: (code, moduleId) => {
    return code.includes('"use server"') || 
           (moduleId && SERVER_PATTERN.test(moduleId));
  }
}

// ❌ Bad: Creating regex on every call
loader: {
  isServerFunctionCode: (code, moduleId) => {
    return code.includes('"use server"') || 
           (moduleId && /\.(server|api)\./.test(moduleId));
  }
}
```

## Integration with Build Tools

### Webpack Integration

```typescript
// For webpack-based builds
loader: {
  importServerPath: "react-server-dom-webpack/server",
  importClientPath: "react-server-dom-webpack/client",
}
```

### Rollup Integration

```typescript
// For Rollup-based builds  
loader: {
  importServerPath: "react-server-dom-esm/server",
  importClientPath: "react-server-dom-esm/client",
}
```

The custom loader system provides the flexibility to adapt the plugin to virtually any React Server Components implementation or build setup while maintaining type safety and performance.

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
13.	[Transformer Plugin](./transformer-plugin.md)
	- [Plugin Architecture](./transformer-plugin.md#plugin-architecture)
	- [Transformation Process](./transformer-plugin.md#transformation-process)
	- [Directive Handling](./transformer-plugin.md#directive-handling)
14.	[Loader](./loader.md)
	- [React Server Components Loader](./loader.md#react-server-components-loader)
	- [Directive Processing](./loader.md#directive-processing)
	- [Module Boundaries](./loader.md#module-boundaries)
	- [Custom Registration Functions](./loader.md#custom-registration-functions)
15.	**[Custom Loader](./custom-loader.md) ← you are here**
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
13.	[Transformer Plugin](./transformer-plugin.md)
	- [Plugin Architecture](./transformer-plugin.md#plugin-architecture)
	- [Transformation Process](./transformer-plugin.md#transformation-process)
	- [Directive Handling](./transformer-plugin.md#directive-handling)
14.	[Loader](./loader.md)
	- [React Server Components Loader](./loader.md#react-server-components-loader)
	- [Directive Processing](./loader.md#directive-processing)
	- [Module Boundaries](./loader.md#module-boundaries)
	- [Custom Registration Functions](./loader.md#custom-registration-functions)
15.	**[Custom Loader](./custom-loader.md) ← you are here**
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

