# CSS Handling

This document explains how CSS is handled in the Vite React Server Plugin for React Server Components (RSC) and static site generation.

## Overview

The plugin provides CSS collection and processing capabilities:

1. **Collect CSS files** from your components and pages
2. **Process CSS files** using `createCssProps` to determine inlining vs linking
3. **Pass CSS as props** to your components at the beginning of the stream

## CSS Collection and Processing

CSS files are automatically collected during the build process from:

1. **Component imports**: CSS files imported by your React components
2. **CSS Modules**: Scoped CSS that gets processed by Vite

### CSS Processing Pipeline

The plugin processes CSS files through `createCssProps` which:

1. **Determines inlining strategy** based on file size and patterns
2. **Creates CSS content objects** with either `as: "style"` or `as: "link"`
3. **Passes processed CSS** as `cssFiles` prop to your components

### Example

```tsx
// src/page/page.tsx
import React from 'react'
import styles from './test.module.css'
import { Link } from '../components/Link.client.js'

export function Page(props: any) {
  return (
    <div className={styles.test}>
      <span className={styles.shared}>Page</span>
      <Link to="/page2">Go to Page 2</Link>
    </div>
  )
}
```

```css
/* src/page/test.module.css */
.test {color: red}
.shared {background: white}
.unused {display: none}
```

## Configuration

Configure CSS processing in your plugin options:

```typescript
export default defineConfig({
  plugins: vitePluginReactServer({
    css: {
      inlineCss: true,           // Enable CSS inlining
      inlineThreshold: 4096,     // Size threshold in bytes (4KB)
      inlinePatterns: [],        // RegExp patterns to force inlining
    }
  }),
});
```

### Configuration Options

- **`inlineCss`**: Enable/disable CSS inlining (default: `true`)
- **`inlineThreshold`**: Files smaller than this size (in bytes) will be inlined (default: `4096`)
- **`inlinePatterns`**: RegExp array - files matching these patterns are always inlined (default: `[]`)

## CSS Props

### cssFiles Prop

The `cssFiles` prop is a `Map<string, CssContent>` containing processed CSS files:

- **Key**: CSS file path
- **Value**: CSS content object created by `createCssProps`

### CssContent Types

CSS files are processed into one of two types:

```typescript
// Inlined CSS (small files or matching patterns)
{
  as: "style",
  type: "text/css",
  id: string,
  children: string // CSS content
}

// Linked CSS (larger files)
{
  as: "link",
  id: string,
  rel: "stylesheet",
  href: string // CSS file URL
}
```

## CSS Rendering

### Css Component

Use the `Css` component to render the processed CSS:

```tsx
import { Css } from "vite-plugin-react-server/components";

export const Root = ({ cssFiles, Page, pageProps, ...props }) => {
  return (
    <div {...props}>
      <Page {...pageProps} />
      <Css cssFiles={cssFiles} />
    </div>
  );
};
```

## Examples

### Basic CSS Usage

```tsx
// src/components/Root.tsx
import React from "react";
import { Css } from "vite-plugin-react-server/components";

export const Root = ({ cssFiles, Page, pageProps, ...props }) => {
  return (
    <div {...props}>
      <Page {...pageProps} />
      <Css cssFiles={cssFiles} />
    </div>
  );
};
```

### CSS Filtering

```tsx
// src/components/Root.tsx
import React from "react";
import { Css } from "vite-plugin-react-server/components";

export const Root = ({ cssFiles, pageProps, Page, ...props }) => {
  // Filter CSS files based on theme
  const filteredCss = new Map();
  
  if (cssFiles) {
    for (const [key, cssContent] of cssFiles.entries()) {
      // Only include CSS files that match the current theme
      if (pageProps?.theme === "dark") {
        if (!key.includes(".light")) {
          filteredCss.set(key, cssContent);
        }
      } else if (pageProps?.theme === "light") {
        if (!key.includes(".dark")) {
          filteredCss.set(key, cssContent);
        }
      } else {
        filteredCss.set(key, cssContent);
      }
    }
  }

  return (
    <div {...props}>
      <Page {...pageProps} />
      <Css cssFiles={filteredCss} />
    </div>
  );
};
```

### Force All CSS Inlining

```typescript
export default defineConfig({
  plugins: vitePluginReactServer({
    css: {
      inlineCss: true,
      inlineThreshold: 0, // Force all CSS to be inlined
    }
  }),
});
```

## Development vs Production

### Development Server

In development mode, CSS handling works differently:

1. **CSS Collection**: CSS files are collected using `collectViteModuleGraphCss` from Vite's module graph
2. **Real-time Processing**: CSS is processed on each request using the current module graph
3. **Vite Integration**: CSS requests are handled by Vite's dev server, not the custom loader
4. **HMR Support**: CSS changes trigger hot module replacement

```typescript
// Development: CSS collected from Vite's module graph
const cssFilesResult = await collectViteModuleGraphCss({
  moduleGraph: server.moduleGraph,
  parentUrl: pagePath,
  handlerOptions: handlerOptions,
});
```

**Note**: Both `collectViteModuleGraphCss` and `createCssProps` functions are available for import if you need to use them directly:

```typescript
import { collectViteModuleGraphCss, createCssProps } from "vite-plugin-react-server/helpers";
```

### Production Build

In production builds:

1. **Build-time Collection**: CSS files are collected during the build process
2. **Static Processing**: CSS is processed once and cached
3. **Optimized Output**: CSS is inlined or linked based on configuration
4. **No Runtime Overhead**: CSS processing happens before streaming

<!-- TOC START -->

## 📚 Documentation Navigation

<!-- Auto-generated TOC - Do not edit manually -->

## Table of Contents

<!-- Auto-generated TOC - Do not edit manually -->



1.	[Getting Started](./getting-started.md)
2.	[Core Concepts](./core-concepts.md)
3.	[Configuration Guide](./configuration.md)
4.	**[CSS & Styling](./css-handling.md) ← you are here**
5.	[Server Actions](./server-actions.md)
6.	[Build & Deployment](./build-orchestration.md)
7.	[Advanced Development](./maintenance/advanced-topics.md)
8.	[Plugin Internals](./maintenance/transformer-plugin.md)
9.	[Worker System](./maintenance/rsc-worker.md)
10.	[API Reference](./api-reference.md)
11.	[React Compatibility](./react-type-compatibility.md)
12.	[Troubleshooting](./troubleshooting-guide.md)
13.	[Package Exports](./package-exports.md)
14.	[Transformations](./transformations.md)

### Quick Links
- [🏠 Main Documentation](./README.md)
- [🚀 Getting Started](./getting-started.md)
- [📖 GitHub Repository](https://github.com/nicobrinkkemper/vite-plugin-react-server)
- [🎮 Official Demo](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)

---

<!-- TOC END -->
