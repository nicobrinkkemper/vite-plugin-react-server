# CSS Handling

This document explains how CSS is handled in the Vite React Server Plugin for React Server Components (RSC) and static site generation.

## Overview

The plugin provides a flexible CSS handling system that allows you to:

1. **Collect CSS files** from your components and pages
2. **Inline small CSS files** to reduce HTTP requests
3. **Link larger CSS files** to avoid bloating HTML
4. **Customize CSS rendering** with your own CssCollector component

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
    inlineCss: false,           // Global flag to disable inlining
    inlineThreshold: 4096,      // Size threshold in bytes (4KB)
    inlinePatterns: [           // RegExp patterns to force inlining
      /\.critical\.css$/,
      /\.module\.css$/
    ],
    linkPatterns: [             // RegExp patterns to force linking
      /node_modules/,
      /\.large\.css$/
    ]
  }
};
```

### Configuration Options

- **`inlineCss`**: Global flag to disable CSS inlining completely
- **`inlineThreshold`**: Files smaller than this size (in bytes) will be inlined
- **`inlinePatterns`**: RegExp array - files matching these patterns are always inlined
- **`linkPatterns`**: RegExp array - files matching these patterns are always linked

## CssCollector Component

The `CssCollector` is responsible for rendering CSS files and the page component. You can use the default implementation or create your own.

### Default CssCollector

```typescript
import { CssCollectorElements } from "vite-plugin-react-server/components";

// Use the default implementation
export const config = {
  CssCollector: CssCollectorElements
};
```

### Custom CssCollector

```typescript
import React from "react";
import type { CssCollectorProps } from "vite-plugin-react-server/types";

export const MyCssCollector = ({
  as: Component = "div",
  cssFiles,
  Page,
  pageProps,
  ...props
}: CssCollectorProps) => {
  return (
    <Component {...props}>
      {/* Render CSS files from Map */}
      {cssFiles && Array.from(cssFiles.values()).map(cssContent => 
        cssContent.as === "style" ? (
          <style key={cssContent.id} type={cssContent.type}>
            {cssContent.children}
          </style>
        ) : (
          <link 
            key={cssContent.id} 
            href={cssContent.href} 
            rel={cssContent.rel}
            precedence={cssContent.precedence}
          />
        )
      )}
      
      {/* Render the page component */}
      {Page && pageProps && <Page {...pageProps} />}
    </Component>
  );
};
```

### CssCollectorProps Interface

```typescript
interface CssCollectorProps<
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

You can filter CSS files in your custom CssCollector to implement CSS purging or conditional loading:

```typescript
import React from "react";
import { CssCollectorElements } from "vite-plugin-react-server/components";
import type { CssCollectorProps } from "vite-plugin-react-server/types";

export const FilteredCssCollector = ({
  cssFiles,
  pageProps,
  Page,
  ...props
}: CssCollectorProps<"div", boolean, { theme: string }>) => {
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
      <CssCollectorElements cssFiles={filteredCssFiles} />
    </div>
  );
};
```

## Usage in Html Component

The CssCollector is typically used within your Html component:

```typescript
import React from "react";
import type { HtmlProps } from "vite-plugin-react-server/types";
import { CssCollectorElements } from "vite-plugin-react-server/components";

export const Html = ({
  CssCollector,
  cssFiles,
  globalCss,
  pageProps,
  Page
}: HtmlProps) => (
  <html>
    <head>
      {/* Global CSS (from client entry imports) */}
      <CssCollectorElements cssFiles={globalCss} />
    </head>
    <body>
      {/* Page-specific CSS and content */}
      <CssCollector
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

export const Page = () => (
  <div className={styles.container}>
    <h1>Home Page</h1>
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
import { MyCssCollector } from "./components/MyCssCollector";

export const config = {
  moduleBase: "src",
  Page: (url) => `src/pages${url}/page.tsx`,
  CssCollector: MyCssCollector,
  css: {
    inlineCss: true,
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
- Use a custom CssCollector component
