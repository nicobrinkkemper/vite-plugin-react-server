# CSS Handling
This document explains how CSS is handled in the Vite React Server Plugin for React Server Components (RSC) and static site generation.

## Overview

The plugin provides a flexible CSS handling system that allows you to:

1. **Collect CSS files** from your components and pages
2. **Inline small CSS files** to reduce HTTP requests
3. **Link larger CSS files** to avoid bloating HTML
4. **Customize CSS rendering** with your own Root component

## CSS Collection Process

CSS files are automatically collected during the build process from:

1. **Component imports**: CSS files imported by your React components
2. **Global CSS**: Application-wide styles imported in your client entry
3. **CSS Modules**: Scoped CSS that gets processed by Vite

### CssContent Interface

Each CSS file is represented by this interface:

```typescript
type BaseCssProps = {
  as: string;
  id: string;
};

export type LinkCssProps = BaseCssProps & {
  as: "link";
  type?: never;
  children?: never;
  id: string;
  href: string;
  rel: "stylesheet";
  precedence?: string;
};

export type StyleCssProps = BaseCssProps & {
  as: "style";
  type: "text/css";
  children?: React.ReactNode;
  precedence?: never;
  rel?: never;
  href?: never;
};

export type CssContent<InlineCSS extends boolean = boolean> =
  InlineCSS extends true
    ? StyleCssProps
    : InlineCSS extends false
    ? LinkCssProps
    : StyleCssProps | LinkCssProps;
```

## Configuration

Configure CSS handling in your plugin options:

```typescript
export const config = {
  // ... other options
  css: {
    inlineCss: false,           // Global flag to disable inlining on threshold
    inlineThreshold: 4096,      // Size threshold in bytes (4KB)
    inlinePatterns: [           // RegExp patterns to force inlining
      /\.inline\.css$/,
    ],
    linkPatterns: [             // RegExp patterns to force linking
      /^node_modules/,
      /^@/           
    ]
  }
};
```

### Configuration Options

- **`inlineCss`**: Global flag to disable CSS inlining completely
- **`inlineThreshold`**: Files smaller than this size (in bytes) will be inlined
- **`inlinePatterns`**: RegExp array - files matching these patterns are always inlined
- **`linkPatterns`**: RegExp array - files matching these patterns are always linked

## Root Component

The `Root` is responsible for rendering CSS files and the page component. You can use the default implementation or create your own.

### Default Root

```typescript
import { Root } from "vite-plugin-react-server/components";

// Direct component, allowed only when condition is "react-server"
export const config = {
  moduleBase: 'src',
  Root: Root
};
```
You can also use a string path to import the root, this is useful if you want to also use it in the worker.
```typescript
export const config = {
  moduleBase: 'src',
  // ... rest of config
  // Your custom Root, resolved during each "resolveOptions" including in rsc-worker
  Root: "./src/MmcRoot.tsx"
}
```

Example of custom Root component
```typescript
import React from "react";
import { Css } from "vite-plugin-react-server/components";
import type { RootProps } from "vite-plugin-react-server/types";
import { themes } from "./config/themeConfig.js";

// type Theme = "4ymm" | "5ymm" | "6ymm" | "7mmc" | "8mmc" | "9mmc"

const removableCSS = [
  "/src/css/4ymm.module.css",
  "/src/css/5-6ymm.module.css",
  "/src/css/7mmc.module.css",
  "/src/css/8mmc.module.css",
  "/src/css/9mmc.module.css",
];

const createFilter = (theme: Theme) => {
  if (theme === "5ymm" || theme === "6ymm") {
    return [theme, removableCSS.filter((css) => css.includes("5-6ymm"))];
  }
  return [theme, removableCSS.filter((css) => css.includes(theme))];
};

const filters = Object.fromEntries(themes.map(createFilter)) as {
  [key in Theme]: string[];
};

export const MmcRoot = ({
  as: Component = 'div',
  cssFiles,
  pageProps,
  Page,
  ...props
}: RootProps<
  {
    pathInfo: { theme: Theme };
  }
>) => {
  const theme = pageProps.pathInfo.theme;
  const cssArray = Array.from(cssFiles.values());
  const removeNonCurrentThemeCss = new Map(
    cssArray
      .filter(
        (file) =>
          !removableCSS.includes(file.id) || filters[theme].includes(file.id)
      )
      .map((file) => [file.id, file])
  );
  return (
    <Component {...props}>
      <Page {...pageProps} />
      <Css cssFiles={removeNonCurrentThemeCss} />
    </Component>
  );
};

```

## Changing export name

You can change the export name "Root":
```typescript
export const config = {
  Root: "src/RenderPage.tsx",
  rootExportName: "RenderPage",
}
```
Or alternatively
```typescript
export const config = {
  Root: "src/RenderPage.tsx#RenderPage",
}
```

### Custom Html

The Root component from the config will always be included in the props for the Html component.

```typescript
import React from "react";
import { Css, type HtmlProps } from "vite-plugin-react-server/components";

export const Html = ({
  Root,
  cssFiles,
  globalCss,
  pageProps = {},
  Page,
}: HtmlProps) => {
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

This component is used when:
- Generating a static build, it gets serialized into the index.html and index.rsc files
- Serving the app using `react-server` condition, serialized into Page rsc requests

The Root is the Root component of the development application. To give the user full control over the final css that gets used,
the Root is required to render the Page using the provided props. The plugin makes sure that the props will be resolved using the 
user configuration.

### RootProps Interface

```typescript
interface RootProps<
  As extends keyof JSX.IntrinsicElements = "div",
  InlineCSS extends boolean = boolean,
  PageProps = any
> {
  as: As;                                              // HTML element type
  cssFiles?: Map<string, CssContent<InlineCSS>>;       // CSS files Map
  Page: PageComponentType<PageProps>;                  // Page component
  pageProps?: PageProps;                               // Props for the page
  id?: string;                                         // Element ID
}
```

## CSS Filtering and Purging

You can filter CSS files in your custom Root to implement CSS purging or conditional loading:

```typescript
import React from "react";
import { Css } from "vite-plugin-react-server/components";
import type { RootProps } from "vite-plugin-react-server/types";

export const FilteredRoot = ({
  cssFiles,
  pageProps,
  Page,
  ...props
}: RootProps<"div", boolean, { theme: string }>) => {
  // Filter CSS files based on theme
  const filteredCssFiles = new Map();
  
  if (cssFiles) {
    for (const [key, cssContent] of cssFiles.entries()) {
      // Only include CSS files that match the current theme
      if (pageProps?.theme === "dark") {
        if (!key.includes(".light")) {
          filteredCssFiles.set(key, cssContent);
        }
      } else if (pageProps?.theme === "light") {
        if (!key.includes(".dark")) {
          filteredCssFiles.set(key, cssContent);
        }
      } else {
        filteredCssFiles.set(key, cssContent);
      }
    }
  }

  return (
    <div {...props}>
      <Page {...pageProps} />
      <Css cssFiles={filteredCssFiles} />
    </div>
  );
};
```

## Usage in Html Component

The Root is typically used within your Html component:

```typescript
import React from "react";
import type { HtmlProps } from "vite-plugin-react-server/types";
import { Css } from "vite-plugin-react-server/components";

export const Html = ({
  Root,
  cssFiles,
  globalCss,
  pageProps,
  Page
}: HtmlProps) => (
  <html>
    <head>
      {/* Global CSS (from client entry imports) */}
      <Css cssFiles={globalCss} />
    </head>
    <body>
      {/* Page-specific CSS and content */}
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
```

## CSS Types: Global vs Page-Specific

### Global CSS
- Imported in your client entry file (`src/client.tsx`)
- Available on all pages
- Rendered in the `<head>` section
- Examples: reset styles, fonts, global themes

```typescript
// src/client.tsx
import "./styles/global.css";
import "./styles/reset.css";
```

### Page-Specific CSS
- Imported by individual page components
- Only included when the page is rendered
- Rendered with the page content
- Examples: component styles, page layouts

```typescript
// src/page/home/page.tsx
import "./home.css";
import styles from "./home.module.css";

export const Page = ({ title }: { title: string }) => (
  <div className={styles.container}>
    <h1>{title}</h1>
  </div>
);
```

## Performance Optimization

### Inlining Strategy

The plugin automatically decides whether to inline or link CSS files based on:

1. **Size**: Files smaller than `inlineThreshold` are inlined
2. **Patterns**: Files matching `inlinePatterns` are always inlined
3. **Link patterns**: Files matching `linkPatterns` are always linked
4. **Global flag**: If `inlineCss` is false, no files are inlined

### Best Practices

1. **Inline critical CSS**: Use `inlinePatterns` for above-the-fold styles
2. **Link large files**: Use `linkPatterns` for vendor CSS or large stylesheets
3. **Set appropriate threshold**: Balance between HTTP requests and HTML size
4. **Use CSS Modules**: They're automatically optimized and can be inlined efficiently

## Working with the CSS Map

Since `cssFiles` is a Map, you can use standard Map methods:

```typescript
// Iterate over CSS files
cssFiles.forEach((cssContent, key) => {
  console.log(`CSS file: ${key}`, cssContent);
});

// Check if a specific CSS file exists
if (cssFiles.has('my-component.css')) {
  const cssContent = cssFiles.get('my-component.css');
}

// Convert to array for filtering
const cssArray = Array.from(cssFiles.entries());
const filteredCss = cssArray.filter(([key, content]) => 
  !key.includes('vendor')
);

// Create new Map from filtered results
const filteredCssMap = new Map(filteredCss);
```

## Examples

### Complete CSS Configuration

```typescript
import { MyRoot } from "./components/MyRoot";

export const config = {
  moduleBase: "src",
  Page: (url) => `src/pages${url}/page.tsx`,
  Root: MyRoot,
  css: {
    inlineThreshold: 2048, // 2KB
    inlinePatterns: [
      /\.critical\.css$/,
      /\.module\.css$/,
      /\.inline\.css$/
    ],
    linkPatterns: [
      /node_modules/,
      /\.vendor\.css$/,
      /\.large\.css$/
    ]
  }
};
```

This configuration will:
- Enable CSS inlining globally
- Inline files smaller than 2KB
- Always inline critical, module, and inline CSS files
- Always link vendor and large CSS files
- Use a custom Root component

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
3.	[Configuration Guide](./configuration.md)
	- [Plugin Options](./configuration.md#plugin-options)
	- [Routing Configuration](./configuration.md#routing-configuration)
	- [Build Configuration](./configuration.md#build-configuration)
4.	**[CSS & Styling](./css-handling.md) ← you are here**
	- [CSS Collectors](./css-handling.md#css-collectors)
	- [Inline CSS](./css-handling.md#inline-css)
	- [Custom CSS Processing](./css-handling.md#custom-css-processing)
5.	[Server Actions](./server-actions.md)
	- [Creating Server Actions](./server-actions.md#creating-server-actions)
	- [Client Integration](./server-actions.md#client-integration)
	- [Error Handling](./server-actions.md#error-handling)
	- [Database Integration](./server-actions.md#database-integration)
6.	[Build & Deployment](./build-orchestration.md)
	- [Multiple Build Targets](./build-orchestration.md#multiple-build-targets)
	- [Plugin Architecture](./build-orchestration.md#plugin-architecture)
	- [Environment-Specific Builds](./build-orchestration.md#environment-specific-builds)
7.	[Advanced Development](./advanced-topics.md)
	- [Custom Workers](./advanced-topics.md#custom-workers)
	- [Message System](./advanced-topics.md#message-system)
	- [Extending the Plugin](./advanced-topics.md#extending-the-plugin)
8.	[Plugin Internals](./transformer-plugin.md)
	- [Plugin Architecture](./transformer-plugin.md#plugin-architecture)
	- [Transformation Process](./transformer-plugin.md#transformation-process)
	- [Directive Handling](./transformer-plugin.md#directive-handling)
9.	[Worker System](./rsc-worker.md)
	- [Worker Architecture](./rsc-worker.md#worker-architecture)
	- [Message Handling](./rsc-worker.md#message-handling)
	- [Performance Optimization](./rsc-worker.md#performance-optimization)
10.	[API Reference](./api-reference.md)
	- [Plugin Options](./api-reference.md#plugin-options)
	- [Component Props](./api-reference.md#component-props)
	- [Worker Messages](./api-reference.md#worker-messages)
	- [Type Definitions](./api-reference.md#type-definitions)
11.	[React Compatibility](./react-type-compatibility.md)
	- [Type System Overview](./react-type-compatibility.md#type-system-overview)
	- [Generic Types](./react-type-compatibility.md#generic-types)
	- [Version Compatibility](./react-type-compatibility.md#version-compatibility)
12.	[Troubleshooting](./troubleshooting-guide.md)
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







