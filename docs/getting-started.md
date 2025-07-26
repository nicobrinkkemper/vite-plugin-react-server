# Getting Started

This guide will help you set up a React Server Components project using Vite and the `vite-plugin-react-server` plugin.

## Installation and Setup

### 1. Install Dependencies

```bash
npm install -D patch-package react@experimental react-dom@experimental react-server-dom-esm
```

To start using `react-server-dom-esm`, run the patch file after installing.

```bash
npm run patch
```

### 2. Create Vite Configuration

Create `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";

export default defineConfig({
  plugins: vitePluginReactServer({
    moduleBase: "src",
    Page: (url) => `src/page${url}page.tsx`,
    props: (url) => `src/page${url}props.ts`,
    build: { pages: ["/", "/about"] }
  })
});
```

### 3. Create Page Components with Type Safety

Create a page component at `src/page/page.tsx`:

```tsx
import type { PageProps } from "./props.js";

export const Page = ({ name, title }: PageProps) => {
  return (
    <div>
      <h1>{title}</h1>
      <p>Hello {name}</p>
    </div>
  );
};
```

Create a props file at `src/page/props.ts`:

```ts
export const props = ({ url }: { url: string }) => ({
  name: "World",
  title: "Welcome to React Server Components",
  description: "A modern approach to server-side rendering",
  url,
});

// Export the type for use in the page component
export type PageProps = ReturnType<typeof props>;
```

### 4. Create About Page

Create `src/about/page.tsx`:

```tsx
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

Create `src/about/props.ts`:

```ts
export const props = () => ({
  title: "About Us",
  content: "This is a React Server Components application built with Vite.",
});

export type PageProps = ReturnType<typeof props>;
```

### 5. Add Scripts to package.json

```json
{
  "scripts": {
    "build": "npm run build:static && npm run build:client && npm run build:server",
    "dev": "NODE_OPTIONS='--conditions react-server' vite",
    "dev:client": "vite",
    "build:server": "NODE_OPTIONS='--conditions react-server' vite build",
    "build:client": "vite build --ssr",
    "build:static": "vite build",
    "debug-build": "NODE_ENV=development npm run build:client -- --mode development && NODE_ENV=development npm run build:server -- --mode development",
    "test": "vitest",
    "patch": "patch",
    "postinstall": "patch-package"
  }
}
```

## Type Safety

### Create Custom HTML Component

Create `src/CustomHtml.tsx`:

```tsx
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

### Create Custom Root Component

Create `src/CustomRoot.tsx`:

```tsx
import React from "react";
import type { RootComponentType } from "vite-plugin-react-server/types";

export const Root: RootComponentType = ({ Page, pageProps = {}, as = "div", cssFiles, ...props }) => {
  return React.createElement(as, props, 
    React.createElement(Page, pageProps)
  );
};
```

### Component Resolution: Path-based vs Direct Components

The plugin supports two ways to provide components:

#### 1. Path-based Resolution (Recommended for Development)

Use string paths that get resolved at runtime:

```ts
export const config = {
  // Serializable paths (used by RSC worker mode)
  Root: "src/CustomRoot.tsx",
  Html: "src/CustomHtml.tsx",
  Page: (url) => `src/page${url}/page.tsx`,
  props: (url) => `src/page${url}/props.ts`,
  
  // ... rest of config
} satisfies StreamPluginOptions;
```

**When to use:** Development mode, RSC worker mode, when you want hot reloading

#### 2. Direct Component References (For Static Builds)

Use direct component imports to avoid file resolution:

```ts
import { CustomRootComponent } from "./src/CustomRoot";
import { CustomHtmlComponent } from "./src/CustomHtml";

export const config = {
  // Direct component overrides (used by static builds)
  components: {
    Root: CustomRootComponent,
    Html: CustomHtmlComponent,
    Page: () => <div>Static Page</div>, // Direct component
  },
  
  // ... rest of config
} satisfies StreamPluginOptions;
```

### Export Name Configuration

You can customize the export names when using path resolution:

```ts
export const config = {
  Root: "src/components.tsx#MyCustomRoot",  // Fragment syntax
  rootExportName: "MyCustomRoot",           // Or global config
  htmlExportName: "MyCustomHtml",
  pageExportName: "Page",                   // Default
  propsExportName: "props",                 // Default
  // ... rest of config
} satisfies StreamPluginOptions;
```

### Server Actions with Type Safety

Create `src/actions.server.ts`:

```tsx
"use server";

import type { PageProps } from "./page/props";

export async function updatePageData(
  data: Partial<PageProps>
): Promise<{ success: boolean; data?: PageProps }> {
  try {
    // Simulate database update
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return {
      success: true,
      data: { ...data } as PageProps,
    };
  } catch (error) {
    console.error("Failed to update page data:", error);
    return {
      success: false,
    };
  }
}
```

## Example Projects

For complete examples and production implementations:

1. [bidoof-template](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official) - Playground example with:
   - GitHub Pages deployment workflow
   - API fetching utilities
   - CSS Modules setup
   - Client-side navigation
   - Error boundary
   - TypeScript configuration

2. [mmcelebration.com](https://github.com/nicobrinkkemper/mmc) - Production implementation with:
   - GitHub Pages deployment workflow
   - Advanced routing patterns
   - Image generation
   - "white-label" front-end using esm modules
   - Type-safe props/page routing

## Key Concepts

### When to Use `components.Page` vs `Page`

- **Use `Page` (path-based)**: When you want the plugin to resolve the component from a file path. This enables hot reloading and dynamic loading.

- **Use `components.Page` (direct)**: When you want to provide the component directly, bypassing file resolution. This is useful for static builds or when you need to avoid the overhead of file loading.

### React Component Structure

**Correct**: Export components as named exports
```tsx
// ✅ Good: Named export
export const Page = ({ title }: PageProps) => {
  return <div>{title}</div>;
};
```

**Incorrect**: Export components at top level without proper structure
```tsx
// ❌ Bad: Top-level component without proper export
const Page = ({ title }: PageProps) => {
  return <div>{title}</div>;
};
```

### Development vs Production

- **Development**: Uses worker threads for RSC processing with hot module replacement
- **Production**: Generates static HTML and RSC files for optimal performance 

<!-- TOC START -->

## 📚 Documentation Navigation

<!-- Auto-generated TOC - Do not edit manually -->

## Table of Contents

<!-- Auto-generated TOC - Do not edit manually -->

## Table of Contents

<!-- Auto-generated TOC - Do not edit manually -->

1.	**[Getting Started](./getting-started.md) ← you are here**
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

### Quick Links
- [🏠 Main Documentation](./README.md)
- [🚀 Getting Started](./getting-started.md)
- [📖 GitHub Repository](https://github.com/nicobrinkkemper/vite-plugin-react-server)
- [🎮 Official Demo](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)

---

<!-- TOC END -->

