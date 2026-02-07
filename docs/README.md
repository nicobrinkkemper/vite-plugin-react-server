# Vite React Server Plugin Documentation

Welcome to the documentation for the Vite React Server Plugin. This plugin enables React Server Components (RSC) streaming and static HTML page generation using Vite, with TypeScript support and testing.

## Table of Contents

<!-- Auto-generated TOC - Do not edit manually -->

1.	[Getting Started](./getting-started.md)
2.	[Core Concepts](./core-concepts.md)
3.	[Configuration Guide](./configuration.md)
4.	[CSS & Styling](./css-handling.md)
5.	[Server Actions](./server-actions.md)
6.	[Build & Deployment](./build-orchestration.md)
7.	[Advanced Development](./advanced-topics.md)
8.	[Plugin Internals](./transformer-plugin.md)
9.	[Worker System](./rsc-worker.md)
10.	[API Reference](./api-reference.md)
11.	[React Compatibility](./react-type-compatibility.md)
12.	[Troubleshooting](./troubleshooting-guide.md)
13.	[Package Exports](./package-exports.md)
14.	[Transformations](./transformations.md)

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
type MyPageProps = {
  title: string;
};

type MyHtmlProps = HtmlProps<MyPageProps>;
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
### Flexible Implementation
- **Multiple Build Targets**: Generate static, client, and server builds
- **Customizable Workers**: Override default behavior with custom implementations
- **Event System**: Monitor builds, metrics, and performance
- **Environment Detection**: Automatic adaptation based on execution context
## Documentation Structure
The documentation has been consolidated into 14 focused chapters to reduce redundancy and improve navigation:
### Getting Started (1 chapter)
- Complete setup guide with examples
- Development modes and common use cases
- Production build process
### Core Concepts (1 chapter)
- Essential implementation understanding
- Development modes and conditions
- React Server Components basics
### Configuration (1 chapter)
- All plugin options and configuration
- Component resolution strategies
- Build and environment configuration
### Feature Guides (3 chapters)
- **CSS & Styling**: Complete CSS handling guide
- **Server Actions**: Server action implementation
- **Build & Deployment**: Build process and deployment
### Advanced Topics (3 chapters)
- **Advanced Development**: Custom workers and extensions
- **Plugin Internals**: Transformation and loader system
- **Worker System**: Worker implementation and communication
### Reference (3 chapters)
- **API Reference**: Complete API documentation
- **React Compatibility**: Version compatibility and patches
- **Troubleshooting**: Common issues and solutions
## Plugin Implementation Documentation

The plugin is composed of several specialized modules, each with their own documentation:

### Core Transformation
- **[Plugin Internals](./transformer-plugin.md)** - Core React Server Components transformation logic
  - AST-based module transformation
  - Environment-specific directive handling
  - Client/server boundary management

### Worker System
- **[Worker System](./rsc-worker.md)** - React Server Components and HTML processing workers
  - Server condition access in client environments
  - Message-based RSC streaming
  - Custom worker extensibility
  - HTML generation and transformation

## Contributing

When contributing to the documentation:

1. **Follow the consolidated structure** - Each chapter should be focused and avoid redundancy
2. **Cross-reference appropriately** - Link to related sections instead of duplicating content
3. **Keep examples practical** - Provide real-world, working examples
4. **Update the table of contents** - Ensure navigation stays current
5. **Test all code examples** - Verify examples work with current plugin versions 