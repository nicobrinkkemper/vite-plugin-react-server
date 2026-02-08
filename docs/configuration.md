# Configuration Guide

This guide covers all configuration options and component resolution strategies for the Vite React Server Plugin.

## Core Configuration Options

### moduleBase

```ts
import type { StreamPluginOptions } from "vite-plugin-react-server/types";

const config = {
  moduleBase: "src", // source prefix
```

`src` is a convention, you can name it however you want.

### moduleBasePath

```ts
  moduleBasePath: "", // import prefix
```

`moduleBasePath` is used as the second argument to React's `renderToPipeableStream` for server-side rendering. Defaults to "".

### moduleBaseURL

```ts
  moduleBaseURL: "/", // url prefix
```

`moduleBaseURL`. Defaults to VITE_BASE_URL or "/"

> Note: When deploying to a subdirectory (e.g., GitHub Pages), make sure moduleBaseURL matches your base path.

```ts
publicOrigin: "", // URL parseable origin
```

`publicOrigin` should be used as a static replacement for location.origin. Defaults to VITE_PUBLIC_ORIGIN or ""

## Component Resolution

The plugin supports two main approaches for providing components:

1. **Path-based Resolution** (`Page`, `Html`, `Root`) - Components are resolved from file paths
2. **Direct Component References** (`components.Page`, `components.Html`, `components.Root`) - Components are provided directly

### Path-based Resolution

#### When to Use

- **Development mode** with hot reloading
- **RSC worker mode** for dynamic component loading
- When you want the plugin to handle file resolution
- When you need to support different components per route

#### Configuration

```ts
export const config = {
  moduleBase: "src",
  
  // Page components - resolved from file paths
  Page: (url) => `src/pages${url}/page.tsx`,
  props: (url) => `src/pages${url}/props.ts`,
  
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

#### How It Works

1. The plugin resolves the file path using the provided function or string
2. Loads the module and extracts the named export
3. Uses the component in the rendering pipeline
4. Supports hot reloading in development

#### Example File Structure

```
src/
├── pages/
│   ├── page.tsx          # Home page component
│   └── props.ts          # Home page props
├── pages/about/
│   ├── page.tsx          # About page component
│   └── props.ts          # About page props
├── CustomHtml.tsx        # HTML wrapper component
└── CustomRoot.tsx        # Root wrapper component
```

#### Page Component Example

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

### Direct Component References

#### When to Use

- **Static builds** where you want to avoid file resolution overhead
- When you need to provide components directly without file loading
- When you want to use the same component for all routes
- Performance-critical scenarios

#### Configuration

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

#### How It Works

1. Components are provided directly to the plugin
2. No file resolution is performed
3. The same component is used for all routes
4. Faster build times but no hot reloading

#### Example Direct Components

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

### Component Resolution Priority

The plugin resolves components in this specific order:

1. **Direct components** (`components.Page`, `components.Html`, `components.Root`) - Highest priority
2. **Path resolution** (`Page`, `Html`, `Root` strings/functions) - Medium priority
3. **Default components** - Plugin fallbacks (lowest priority)

### Example with Mixed Configuration

```ts
export const config = {
  moduleBase: "src",
  
  // Path-based resolution for pages
  Page: (url) => `src/pages${url}/page.tsx`,
  props: (url) => `src/pages${url}/props.ts`,
  
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

## Routing Configuration

### Page & Props (Path-based Resolution)

```ts
// Simple string-based routing
Page: "src/page/page.tsx",
props: "src/page/props.ts",
pageExportName: "Page",
propsExportName: "props",
```

Basically a router for mapping urls to source code. It can be any implementation you want. The props is optional to use, but it's very powerful since anything it returns will be the props for the page component as well as be accessible in the Html component. If you didn't define a props router, you can still define the `props` in the Page file.

## Dev Configuration

### dev.useRscWorker

```ts
{
  dev: {
    useRscWorker: false, // default
  }
}
```

Controls whether to use the RSC worker in development mode.

**Default behavior (`false`)**: In dev mode, RSC rendering happens directly on the main thread using Vite's environment runner. This provides:
- Proper HMR support (file changes are picked up immediately)
- No module caching issues
- Simpler debugging (all code runs in main thread)

**With `useRscWorker: true`**: Uses the same RSC worker as production builds. Useful for:
- Testing production behavior in development
- Debugging worker-specific issues

```ts
// To test production-like behavior in dev:
export default {
  dev: {
    useRscWorker: true,
  },
  // ... other options
} satisfies StreamPluginOptions;
```

### HMR in Development

When a server component file changes, the plugin:
1. Invalidates the module in Vite's cache
2. Sends a `vite-plugin-react-server:server-component-update` WebSocket event
3. The client can listen for this event to refetch the RSC stream

For automatic RSC refetching on HMR, use the `setupRscHmr` helper in your client entry:

```tsx
import { createReactFetcher, setupRscHmr } from "vite-plugin-react-server/utils";

const { initialContent, refetch } = createReactFetcher({ callServer });

// Enable HMR for server components
if (import.meta.hot) {
  setupRscHmr(import.meta.hot, refetch);
}
```

## Build Configuration

### build

```ts
  moduleBase: 'src',
  Page: (url) => `src/pages${url}/page.tsx`,
  build: {
     pages: ["/","/about"]
     dir:    "dist",    // dist/**
     client: "client",  // **/client
     server: "server",  // **/server
     static: "static"   // **/static
     hash: "hash",      //  -[hash].js for client files
     preserveModulesRoot: false // when true, preserve `src/` in build output paths
  }
```

### preserveModulesRoot Behavior

The `build.preserveModulesRoot` option controls how the `moduleBase` directory appears in build output paths:

#### When `preserveModulesRoot: true` (preserve paths)
- **Input:** `src/page/home.tsx`
- **Output:** `dist/client/src/page/home.js`
- **Behavior:** The `src/` directory is **preserved** in the output path

#### When `preserveModulesRoot: false` (strip paths - default)
- **Input:** `src/page/home.tsx`  
- **Output:** `dist/client/page/home.js`
- **Behavior:** The `src/` directory is **removed** from the output path

This option is useful when you want to maintain your source directory structure in the build output, especially for debugging or when integrating with tools that expect specific path structures.

## CSS Configuration

```ts
export const config = {
  // ... other config
  css: {
    inlineCss: true,           // Global flag to enable/disable inlining
    inlineThreshold: 4096,     // Size threshold in bytes (4KB)
    inlinePatterns: [          // RegExp patterns to force inlining
      /\.inline\.css$/,
    ],
    linkPatterns: [            // RegExp patterns to force linking
      /^node_modules/,
      /^@/           
    ]
  }
};
```

## Advanced Options

### Custom Root Component

You can customize the root component that wraps your pages:

```tsx
// src/CustomRoot.tsx
import React from "react";
import type { RootComponentType } from "vite-plugin-react-server/types";

export const Root: RootComponentType = ({ Page, pageProps = {}, as: As = React.Fragment, cssFiles, ...props }) => {
  const cssCount = cssFiles ? cssFiles.size : 0;
  
  // For headless stream, use React.Fragment
  if (As === React.Fragment) {
    return React.createElement(React.Fragment, {}, 
      React.createElement(Page, pageProps)
    );
  }
  
  // For normal HTML stream, always render as 'main' regardless of what was passed
  return React.createElement('main', { 
    ...props, 
    "data-function-root": "true",
    "data-css-files": cssCount.toString(),
    role: "main"
  }, 
    React.createElement(Page, pageProps)
  );
};
```

**Configuration:**
```ts
export default defineConfig({
  plugins: vitePluginReactServer({
    Root: (url: string) => `src/CustomRoot.tsx`, // Function that returns string path
    // ... other options
  }),
});
```

### Worker Configuration

```ts
export const config = {
  // ... other config
  htmlWorkerPath: "./path/to/custom/html-worker.js",
  rscWorkerPath: "./path/to/custom/rsc-worker.js",
  rscTimeout: 5000,
  htmlTimeout: 15000,
  htmlWorkerStartupTimeout: 5000,
  rscWorkerStartupTimeout: 5000,
};
```

### Event Handling

```ts
export const config = {
  // ... other config
  verbose: true,
  onMetrics: (metrics: RenderMetrics) => {
    console.log('Build metrics:', metrics);
  },
  onEvent: (event: PluginEvent) => {
    console.log('Plugin event:', event);
  },
};
```

### Custom Normalizers

```ts
export const config = {
  // ... other config
  normalizer: {
    // Custom input normalization
  },
  moduleID: (id: string) => {
    // Custom module ID transformation
    return id.replace(/\.tsx?$/, '.js');
  },
};
```

## EXAMPLE SETUP

Example `package.json` setup:

```json
"scripts": {
  "dev:rsc": "NODE_OPTIONS='--conditions react-server' vite",
  "dev:ssr": "vite",
  "build": "NODE_OPTIONS='--conditions react-server' vite build --app",
  "build:client": "vite build --ssr",
  "build:static": "vite build"
}
```

### ./src/my-page.tsx

```tsx
import React from "react";

export const Page = ({ name }) => {
  return <div>Hello {name}</div>;
};
```

### ./src/my-props.ts

```tsx
export const props = {
  name: "John Doe",
};
```

### ./my-react-config.tsx

```tsx
import React from "react";

export const config = {
  moduleBase: "src",
  Page: "src/my-page.tsx",
  props: "src/my-props.ts",
  Html: ({ Root, cssFiles, pageProps, Page }) => (
    <html>
      <title>{pageProps?.title || "My App"}</title>
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
  ),
  build: {
    pages: ["/", "/about"],
  },
};
```

### ./vite.config.ts

```ts
import { vitePluginReactServer } from "vite-plugin-react-server";
import { config } from "./my-react-config.js";
import { defineConfig } from "vite";
export default defineConfig(() => {
  return {
    plugins: vitePluginReactServer(config),
  };
});
```

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
  Page: (url) => `src/pages${url}/page.tsx`,
  props: (url) => `src/pages${url}/props.ts`,
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
      return `src/pages${url}/page.tsx`;
    } catch {
      return "src/pages/404/page.tsx"; // Fallback page
    }
  },
};
```

### Performance Considerations

- **Path-based**: Slower builds but better development experience
- **Direct components**: Faster builds but no hot reloading
- **Mixed approach**: Best of both worlds for specific use cases

<!-- TOC START -->

## 📚 Documentation Navigation

<!-- Auto-generated TOC - Do not edit manually -->

## Table of Contents

<!-- Auto-generated TOC - Do not edit manually -->



1.	[Getting Started](./getting-started.md)
2.	[Core Concepts](./core-concepts.md)
3.	**[Configuration Guide](./configuration.md) ← you are here**
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

### Quick Links
- [🏠 Main Documentation](./README.md)
- [🚀 Getting Started](./getting-started.md)
- [📖 GitHub Repository](https://github.com/nicobrinkkemper/vite-plugin-react-server)
- [🎮 Official Demo](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)

---

<!-- TOC END -->







