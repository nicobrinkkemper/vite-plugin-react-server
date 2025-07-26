# Vite React Server Plugin Documentation

Welcome to the documentation for the Vite React Server Plugin. This plugin enables React Server Components (RSC) streaming and static HTML page generation using Vite, with TypeScript support and testing.

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
## Plugin Architecture Documentation

The plugin is composed of several specialized modules, each with their own documentation:

### Core Transformation
- **[Transformer Plugin](../plugin/transformer/README.md)** - Core React Server Components transformation logic
  - AST-based module transformation
  - Environment-specific directive handling
  - Client/server boundary management

### Worker System
- **[RSC Worker](../plugin/worker/rsc/README.md)** - React Server Components processing worker
  - Server condition access in client environments
  - Message-based RSC streaming
  - Custom worker extensibility

- **[HTML Worker](../plugin/worker/html/README.md)** - HTML generation and transformation worker
  - HTML rendering from RSC streams
  - Asset optimization and processing
  - Custom HTML transformation pipelines

## Quick Links

- [GitHub Repository](https://github.com/nicobrinkkemper/vite-plugin-react-server)
- [Official Demo](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)
- [Production Example](https://github.com/nicobrinkkemper/mmc)
- [Test Suite](https://github.com/nicobrinkkemper/vite-plugin-react-server/tree/main/test)

## Key Features

### Type Safety
The plugin uses generic types that adapt to your React version and prevent compatibility issues:

```tsx
import React from "react";
import type { HtmlProps } from "vite-plugin-react-server/types";
import { Css } from "vite-plugin-react-server/components";

type MyHtmlProps = HtmlProps<
  // pageProps: defaults, we always pass the title prop
  {
    title: string;
  },
  // inline: boolean, will type cssFiles to either link or tag props
  boolean,
  // as: div, we want to use a div as the root element, any div prop is a valid root prop.
  "div"
>;

export const Html = ({
  Root,
  cssFiles,
  globalCss,
  pageProps = { title: "404 Not Found" },
  Page,
}: MyHtmlProps) => {
  if (!pageProps.title) {
    pageProps.title = "No title";
  }
  return (
    <html>
      <head>
        <Css cssFiles={globalCss} />
      </head>
      <body>
        <Root
          as={"div"}
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

### Testing

335 test cases across 45 test files ensure reliability across:
- Build processes (static, client, server)
- Server action integration
- Error handling and edge cases
- Directive validation and context detection
- Type safety and React compatibility
- Performance with large outputs

### Flexible Architecture
- **Multiple Build Targets**: Generate static, client, and server builds
- **Customizable Workers**: Override default behavior with custom implementations
- **Event System**: Monitor builds, metrics, and performance
- **Environment Detection**: Automatic adaptation based on execution context 