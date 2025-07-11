# Vite React Server Plugin Documentation

Welcome to the documentation for the Vite React Server Plugin. This plugin enables React Server Components (RSC) streaming and static HTML page generation using Vite, with TypeScript support and testing.

## Table of Contents

1. [Getting Started](./getting-started.md)
   - Installation and Setup
   - Basic Configuration
   - Example Projects

2. [Core Concepts](./core-concepts.md)
   - Client-Server Separation
   - React Server Components
   - Plugin Architecture

3. [Configuration](./configuration.md)
   - Plugin Options
   - Routing Configuration
   - Build Configuration

4. [CSS Handling](./css-handling.md)
   - CSS Collectors
   - Inline CSS
   - Custom CSS Processing

5. [Server Actions](./server-actions.md)
   - Creating Server Actions
   - Client Integration
   - Error Handling
   - Database Integration

6. [Static Site Generation](./static-site-generation.md)
   - Static Plugin
   - Build Process
   - Deployment Strategies

7. [Build Orchestration](./build-orchestration.md)
   - Multiple Build Targets
   - Plugin Architecture
   - Environment-Specific Builds

8. [Architecture](./architecture.md)
   - Design Philosophy
   - Environment Variables
   - Plugin Composition
   - HTML Component Support

9. [Advanced Topics](./advanced-topics.md)
   - Custom Workers
   - Message System
   - Extending the Plugin

10. [API Reference](./api-reference.md)
   - Plugin Options
   - Component Props
   - Worker Messages
   - Type Definitions

11. [Transformations](./transformations.md)
    - Code Transformations
    - Directive Handling
    - Build Output Examples

12. [Loader](./loader.md)
    - React Server Components Loader
    - Directive Processing
    - Module Boundaries
    - Custom Registration Functions

13. [Patch System](./patch-system.md)
    - React Version Compatibility
    - Creating Patches
    - Maintenance Guide

14. [Practical Guide](./practical-guide.md)
    - Real-world Examples
    - Debugging Features
    - Production Implementations

15. [Troubleshooting Guide](./troubleshooting-guide.md)
    - Common Issues
    - Debugging Tips
    - Performance Optimization

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
  // we always pass the title prop
  {
    title: string;
  },
  // we want inline css types
  true,
  // we want to use a div as the root element
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