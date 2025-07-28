# Component Resolution Guide

This guide explains the different ways to provide components to the `vite-plugin-react-server` plugin and when to use each approach.

## Overview

The plugin supports two main approaches for providing components:

1. **Path-based Resolution** (`Page`, `Html`, `Root`) - Components are resolved from file paths
2. **Direct Component References** (`components.Page`, `components.Html`, `components.Root`) - Components are provided directly

## Path-based Resolution

### When to Use

- **Development mode** with hot reloading
- **RSC worker mode** for dynamic component loading
- When you want the plugin to handle file resolution
- When you need to support different components per route

### Configuration

```ts
export const config = {
  moduleBase: "src",
  
  // Page components - resolved from file paths
  Page: (url) => `src/page${url}/page.tsx`,
  props: (url) => `src/page${url}/props.ts`,
  
  // Layout components - can be static paths or functions
  Html: "src/CustomHtml.tsx",
  Root: "src/CustomRoot.tsx",
  
  // Custom export names (optional)
  pageExportName: "Page",
  propsExportName: "props",
  htmlExportName: "Html",
  rootExportName: "Root",
  
  build: { pages: ["/", "/about"] }
} satisfies StreamPluginOptions;
```

### How It Works

1. The plugin resolves the file path using the provided function or string
2. Loads the module and extracts the named export
3. Uses the component in the rendering pipeline
4. Supports hot reloading in development

### Example File Structure

```
src/
├── page/
│   ├── page.tsx          # Home page component
│   └── props.ts          # Home page props
├── about/
│   ├── page.tsx          # About page component
│   └── props.ts          # About page props
├── CustomHtml.tsx        # HTML wrapper component
└── CustomRoot.tsx        # Root wrapper component
```

### Page Component Example

```tsx
// src/page/page.tsx
import type { PageProps } from "./props";

export const Page = ({ title, content }: PageProps) => {
  return (
    <div>
      <h1>{title}</h1>
      <p>{content}</p>
    </div>
  );
};
```

## Direct Component References

### When to Use

- **Static builds** where you want to avoid file resolution overhead
- When you need to provide components directly without file loading
- When you want to use the same component for all routes
- Performance-critical scenarios

### Configuration

```ts
import { CustomPage } from "./src/CustomPage";
import { CustomHtml } from "./src/CustomHtml";
import { CustomRoot } from "./src/CustomRoot";

export const config = {
  moduleBase: "src",
  
  // Direct component references
  components: {
    Page: CustomPage,
    Html: CustomHtml,
    Root: CustomRoot,
  },
  
  build: { pages: ["/", "/about"] }
} satisfies StreamPluginOptions;
```

### How It Works

1. Components are provided directly to the plugin
2. No file resolution is performed
3. The same component is used for all routes
4. Faster build times but no hot reloading

### Example Direct Components

```tsx
// src/CustomPage.tsx
export const CustomPage = ({ title }: { title: string }) => {
  return (
    <div>
      <h1>{title}</h1>
      <p>This is a static page component</p>
    </div>
  );
};

// src/CustomHtml.tsx
import React from "react";
import { Css, type HtmlProps } from "vite-plugin-react-server/components";

export const CustomHtml = ({
  Root,
  cssFiles,
  globalCss,
  pageProps = {},
  Page,
}: HtmlProps) => {
  return (
    <html>
      <head>
        <Css cssFiles={globalCss} />
        <title>{pageProps.title || "My App"}</title>
      </head>
      <body>
        <Root
          as="div"
          id="root"
          cssFiles={cssFiles}
          Page={Page}
          pageProps={pageProps}
        />
      </body>
    </html>
  );
};
```

## Component Resolution Priority

The plugin resolves components in this specific order:

1. **Direct components** (`components.Page`, `components.Html`, `components.Root`) - Highest priority
2. **Path resolution** (`Page`, `Html`, `Root` strings/functions) - Medium priority
3. **Default components** - Plugin fallbacks (lowest priority)

### Example with Mixed Configuration

```ts
export const config = {
  moduleBase: "src",
  
  // Path-based resolution for pages
  Page: (url) => `src/page${url}/page.tsx`,
  props: (url) => `src/page${url}/props.ts`,
  
  // Direct component for HTML wrapper
  components: {
    Html: CustomHtml,
  },
  
  // Path-based resolution for Root (fallback)
  Root: "src/CustomRoot.tsx",
  
  build: { pages: ["/", "/about"] }
} satisfies StreamPluginOptions;
```

In this example:
- `Page` components are resolved from file paths (enabling per-route components)
- `Html` component is provided directly (static, no file resolution)
- `Root` component falls back to path resolution

## Migration Guide

### From Path-based to Direct Components

If you want to optimize for static builds:

```ts
// Before: Path-based resolution
export const config = {
  Page: (url) => `src/page${url}/page.tsx`,
  Html: "src/CustomHtml.tsx",
  Root: "src/CustomRoot.tsx",
};

// After: Direct component references
import { CustomPage } from "./src/CustomPage";
import { CustomHtml } from "./src/CustomHtml";
import { CustomRoot } from "./src/CustomRoot";

export const config = {
  components: {
    Page: CustomPage,
    Html: CustomHtml,
    Root: CustomRoot,
  },
};
```

### From Direct Components to Path-based

If you want to enable hot reloading and per-route components:

```ts
// Before: Direct components
export const config = {
  components: {
    Page: CustomPage,
    Html: CustomHtml,
    Root: CustomRoot,
  },
};

// After: Path-based resolution
export const config = {
  Page: (url) => `src/page${url}/page.tsx`,
  props: (url) => `src/page${url}/props.ts`,
  Html: "src/CustomHtml.tsx",
  Root: "src/CustomRoot.tsx",
};
```

## Best Practices

### Development vs Production

- **Development**: Use path-based resolution for hot reloading and debugging
- **Production**: Consider direct components for static builds to improve performance

### Type Safety

Always use TypeScript for better type safety:

```tsx
// Define proper types for your components
import type { PageProps } from "./props";

export const Page = ({ title, content }: PageProps) => {
  return (
    <div>
      <h1>{title}</h1>
      <p>{content}</p>
    </div>
  );
};
```

### Error Handling

Provide fallbacks for component resolution:

```ts
export const config = {
  Page: (url) => {
    try {
      return `src/page${url}/page.tsx`;
    } catch {
      return "src/page/404/page.tsx"; // Fallback page
    }
  },
};
```

### Performance Considerations

- **Path-based**: Slower builds but better development experience
- **Direct components**: Faster builds but no hot reloading
- **Mixed approach**: Best of both worlds for specific use cases

## Troubleshooting

### Common Issues

1. **Component not found**: Check file paths and export names
2. **Type errors**: Ensure proper TypeScript types are defined
3. **Hot reloading not working**: Use path-based resolution in development
4. **Build performance**: Consider direct components for static builds

### Debug Configuration

Enable verbose logging to debug component resolution:

```ts
export const config = {
  verbose: true, // Enable detailed logging
  // ... rest of config
};
```

This will show you exactly how components are being resolved and any issues that arise. 

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
4.	**[Component Resolution](./component-resolution.md) ← you are here**
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

