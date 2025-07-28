# React Type Compatibility

This plugin automatically handles React type compatibility issues that arise when using npm linking or multiple React versions. The types are designed to automatically infer and use your project's React types.

## Recommended Solution: Package.json Overrides

For npm link scenarios with multiple React versions, the **recommended solution** is to use `package.json` overrides:

```json
{
  "overrides": {
    "react": "$react",
    "react-dom": "$react-dom"
  }
}
```

This ensures all packages use the same React version, eliminating type conflicts entirely.

## Automatic Type Inference

The plugin automatically uses your project's React types through TypeScript's generic inference. No manual setup is required in most cases.

## Manual Type Override (Advanced)

If you need to explicitly specify React types, you can create a custom interface:

```typescript
import { CreateCustomInterface } from 'vite-plugin-react-server/plugin/types';
import React from 'react';

// Create a custom interface using your React types
type MyInterface = CreateCustomInterface<typeof React>;

// Use the custom interface in plugin options
import { createReactServerComponentsPlugin } from 'vite-plugin-react-server';

export default defineConfig({
  plugins: [
    createReactServerComponentsPlugin<MyInterface>({
      // your plugin options...
    })
  ]
});
```

## How It Works

The plugin uses TypeScript generics to automatically infer React types from your imports:

1. **Default Behavior**: Uses `React.ReactNode` from the plugin's React import
2. **Generic Inference**: When you provide a custom interface, it uses your React types
3. **Type Safety**: Maintains full type safety while avoiding version conflicts

## Common Scenarios

### npm link with multiple React versions

The recommended solution for npm link scenarios is to use `package.json` overrides:

```json
{
  "overrides": {
    "react": "$react",
    "react-dom": "$react-dom"
  }
}
```

This ensures all packages use the same React version, eliminating type conflicts.

If you can't use overrides, you can use the custom interface approach:

```typescript
// Your project's React (e.g., React 18.3)
import React from 'react';

// Plugin automatically uses your React types
import { createReactServerComponentsPlugin } from 'vite-plugin-react-server';

export default defineConfig({
  plugins: [
    createReactServerComponentsPlugin({
      // Types automatically inferred from your React import
    })
  ]
});
```

### Custom React-like library

```typescript
import { CreateCustomInterface } from 'vite-plugin-react-server/plugin/types';
import { Preact } from 'preact'; // or any React-like library

type PreactInterface = CreateCustomInterface<typeof Preact>;

export default defineConfig({
  plugins: [
    createReactServerComponentsPlugin<PreactInterface>({
      // Uses Preact types
    })
  ]
});
```

## Type Definitions

### Core Types

- `InferReactType<R>` - Generic React type that defaults to `React.ReactNode`
- `CreateCustomInterface<UserReact, T, As>` - Helper to create custom interfaces
- `ReactLikeModule` - Interface for React-like modules

### Component Types

- `PageComponentType<PageProps, R>` - Page component type
- `RootComponentType<PageProps, As, InlineCSS, R>` - Root component type
- `HtmlComponentType<T, As, InlineCSS, R>` - HTML component type

## Troubleshooting

### TypeScript Errors

If you see `ReactNode != ReactNode` errors:

1. **Use package.json overrides** (recommended for npm link):
   ```json
   {
     "overrides": {
       "react": "$react",
       "react-dom": "$react-dom"
     }
   }
   ```
2. **Check React versions**: Ensure you're using compatible React versions
3. **Use custom interface**: Create a custom interface with your React types
4. **Clear TypeScript cache**: Restart your TypeScript language server

### JSX Component Errors

If you see `'Root' cannot be used as a JSX component`:

1. **Import React**: Ensure React is imported in files using JSX
2. **Check types**: Verify your React types are properly inferred
3. **Use explicit typing**: Consider using a custom interface

## Examples

### Basic Usage (Automatic)

```typescript
import { createReactServerComponentsPlugin } from 'vite-plugin-react-server';

export default defineConfig({
  plugins: [
    createReactServerComponentsPlugin({
      // Automatic type inference
    })
  ]
});
```

### Advanced Usage (Custom Interface)

```typescript
import { CreateCustomInterface } from 'vite-plugin-react-server/plugin/types';
import React from 'react';

type MyInterface = CreateCustomInterface<typeof React>;

export default defineConfig({
  plugins: [
    createReactServerComponentsPlugin<MyInterface>({
      // Explicit type control
    })
  ]
});
```

### Component Usage

```typescript
// Your page component
const MyPage: PageComponentType<{ title: string }> = ({ title }) => {
  return <h1>{title}</h1>;
};

// Your root component
const MyRoot: RootComponentType<{ title: string }> = ({ Page, pageProps }) => {
  return (
    <html>
      <body>
        <Page {...pageProps} />
      </body>
    </html>
  );
};
```

The plugin automatically handles type compatibility, so you can focus on building your application without worrying about React version conflicts. 

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
18.	**[React Type Compatibility](./react-type-compatibility.md) ← you are here**
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

