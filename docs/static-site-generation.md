# Static Site Generation
The Vite React Server Plugin provides powerful static site generation (SSG) capabilities, allowing you to pre-render your React Server Components into static HTML and RSC files.

## Overview

Static site generation with this plugin:

1. Pre-renders your React Server Components into static HTML files
2. Generates corresponding "headless" RSC files for client-side hydration
3. Enables easy deployment to any static hosting service
4. Fully customize production html using the react `Html` component
5. Fully customize production css using the react `Root` component

Direct references to React components (like `components.Html` and `componnents.Root`) are only used in `react-server` mode.

### Output Structure

The static plugin generates the following structure:

```
dist/static/
├── index.html
├── index.rsc
├── about/
│   ├── index.html
│   └── index.rsc
├── assets/
│   └── ... (client assets)
└── ... (other static files)
```

## Deployment

The `dist/static` directory can be deployed to any static hosting service:

- GitHub Pages
- Netlify
- Vercel
- AWS S3
- etc.

Simply upload the contents of the `dist/static` directory to your hosting service.

## Customizing Static Generation

### Page Configuration

Configure which pages to generate in your shared config:

```ts
export const config = {
  // ... other config
  build: {
    pages: ["/", "/about", "/blog"],
  },
};
```

### Output Directory

Customize the output directory structure:

```ts
export const config = {
  // ... other config
  build: {
    dir: "dist",     // Base directory
    client: "client", // Client assets directory
    server: "server", // Server assets directory
    static: "static", // Static output directory
  },
};
```

### File Hashing

Configure file hashing for cache busting:

```ts
export const config = {
  // ... other config
  build: {
    hash: "hash", // becomes -[hash]
  },
};
```

## Advanced Static Generation

### Custom HTML Template

You can customize the HTML template used for static generation:

```ts
export const config = {
  // ... other config
  Html: ({ Root, cssFiles, pageProps, Page }) => (
    <html>
      <head>
        <title>{pageProps.title || "My Site"}</title>
        <meta name="description" content={pageProps.description} />
      </head>
      <body>
        <Root as="div" id="root" cssFiles={cssFiles} Page={Page} pageProps={pageProps} />
      </body>
    </html>
  ),
};
```

### CSS Handling

Configure how CSS is handled in static generation:

```ts
export const config = {
  // ... other config
  CSS: {
    inlineThreshold: 4096, // Size threshold for inlining
  },
};
```

See the [CSS Handling](./css-handling.md) document for more details.

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
7.	**[Static Site Generation](./static-site-generation.md) ← you are here**
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

