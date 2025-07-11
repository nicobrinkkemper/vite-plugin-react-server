# Getting Started
This guide will help you get started with the Vite React Server Plugin, which enables React Server Components (RSC) streaming and static HTML page generation with TypeScript support.

## Installation

Install the plugin and its dependencies:

```sh
# Install the plugin
npm install -D vite-plugin-react-server

# Install required React dependencies
npm install -D patch-package react@experimental react-dom@experimental react-server-dom-esm
```

## Setting Up Patches

The plugin includes a patch system to ensure React compatibility. Add the following command to your `package.json` scripts:

```json
"patch": "patch"
```

Run the patch command:

```sh
npm run patch
```

It will instruct you to add:

```json
"postinstall": "patch-package"
```

This ensures the patch is applied after every `npm install`. If errors arise related to `react-server-dom-esm`, verify that the postinstall step ran successfully.

## Basic Setup

### 1. Create Configuration Files

Create a shared configuration file (let's call it `vite.react.config.tsx`):

```ts
import type { StreamPluginOptions } from "vite-plugin-react-server/types";

const createRouter = (file: "props.ts" | "page.tsx") => (url: string) => {
  switch (url) {
    case "/":
      return `src/page/${file}`;
    case "/about":
      return `src/about/${file}`;
    default:
      throw new Error(`Unknown route: ${url}`);
  }
};

export const config = {
  moduleBase: "src",
  Page: createRouter("page.tsx"),
  props: createRouter("props.ts"),
  
  // String paths for serializable components (works in both static and RSC worker modes)
  Root: "src/Root.tsx",
  Html: "src/Html.tsx",
  
  // Alternative: Router functions for dynamic resolution
  // Root: (url) => `src/pages/${url}/Root.tsx`,
  // Html: (url) => `src/pages/${url}/Html.tsx`,
  
  build: {
    pages: ["/", "/about"],
  },
  // Enable monitoring
  verbose: true,
  onEvent: (event) => {
    console.log(`[Plugin] ${event.type}:`, event.data);
  },
  onMetrics: (metrics) => {
    console.log(`[Plugin] Build metrics:`, metrics);
  },
} satisfies StreamPluginOptions;
```

**Note:** All component references (Page, props, Root, Html) now follow the same serializable pattern:
- **String paths**: `"src/CustomRoot.tsx"`
- **Router functions**: `(url) => "src/pages" + url + "/Root.tsx"`
- **Async functions**: `async (url) => "src/Root.tsx"`

For direct component references in static builds, use the `components` override (see Type Safety section below).

Because we are using the `.tsx` extension for this file, we can directly define React server components with full type safety. This does not work for the `vite.config.ts` file, because Vite does not support this extension.

### 2. Create Vite Configuration

Create `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { config } from "./vite.react.config";

export default defineConfig({
  plugins: vitePluginReactServer(config),
});
```

For client-only config files (optional):

```ts
import { defineConfig } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server/client";
import { config } from "./vite.react.config";

export default defineConfig({
  plugins: vitePluginReactServer(config),
});
```

For server-only config files (optional):

```ts
import { defineConfig } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server/server";
import { config } from "./vite.react.config";

export default defineConfig({
  plugins: vitePluginReactServer(config),
});
```

### 3. Create Page Components with Type Safety

Create a page component at `src/page/page.tsx`:

```tsx
import type { PageProps } from "./props";

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
  return React.createElement(as as any, {
    ...props,
    "data-css-count": cssFiles ? cssFiles.size : 0,
  }, 
    React.createElement(Page, pageProps)
  );
};
```

### Component Override for Static Builds

For static builds where you want to avoid file resolution, you can use direct component references:

```ts
import { CustomRootComponent } from "./src/CustomRoot";
import { CustomHtmlComponent } from "./src/CustomHtml";

export const config = {
  // Serializable paths (used by RSC worker mode)
  Root: "src/CustomRoot.tsx",
  Html: "src/CustomHtml.tsx",
  
  // Or, direct component overrides (used by static builds)
  components: {
    Root: CustomRootComponent,
    Html: CustomHtmlComponent,
  },
  
  // ... rest of config
} satisfies StreamPluginOptions;
```

**Component Resolution Priority:**
1. **Direct components** (`components.Root`, `components.Html`) - Used in static builds
2. **Path resolution** (`Root`, `Html` strings/functions) - Used in RSC worker mode
3. **Default components** - Plugin fallbacks

### Export Name Configuration

You can customize the export names when using path resolution:

```ts
export const config = {
  Root: "src/components.tsx#MyCustomRoot",  // Fragment syntax
  rootExportName: "MyCustomRoot",           // Or global config
  htmlExportName: "MyCustomHtml",
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
    return { success: false };
  }
}
```

## Running the Application

### Development Mode

```sh
# Run server-side rendering with direct React pipeline
NODE_OPTIONS='--conditions react-server' npx vite
# or from paclage.json scripts
npm run dev
```

```sh
# Run client-side development using rsc-worker
npx vite
# or from paclage.json scripts
npm run dev:client
```

### Building for Production

```sh
# Build everything
npm run build

# Or build separately for debugging
npm run build:static  # Static assets
npm run build:client  # Client-side rendering modules
npm run build:server  # Server components and actions
```

### Testing Your Build

```sh
# Run development build to see detailed errors
npm run debug-build

# Test the built application
npx vite preview
```

## Verification

After setup, verify everything works:

1. **Development server**: `npm run dev` should start without errors
2. **Build process**: `npm run build` should complete successfully
3. **Type checking**: `npx tsc --noEmit` should pass
4. **Generated files**: Check `dist/` for static, client, and server directories

## Example Projects

For more examples, check out these projects:

- **[Official Demo](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)** - Simple playground with GitHub Pages deployment
- **[MMC Project](https://github.com/nicobrinkkemper/mmc)** - Production implementation with advanced features

These examples demonstrate various features and configurations of the plugin in real-world applications, including:

- Advanced routing patterns
- Server actions with database integration
- Custom CSS handling
- Type-safe component props
- Error boundaries and error handling
- Performance monitoring and metrics

## Next Steps

- Read [Core Concepts](./core-concepts.md) to understand the architecture
- Learn about [Server Actions](./server-actions.md) for dynamic functionality
- Explore [CSS Handling](./css-handling.md) for styling your components
- Check out [Build Orchestration](./build-orchestration.md) for deployment strategies 

<!-- AUTO-GENERATED-TOC-START -->

## 📚 Documentation Navigation

## Table of Contents

1. **[Getting Started](./getting-started.md) ← you are here**
	- [Installation and Setup](./getting-started.md#installation-and-setup)
	- [Basic Configuration](./getting-started.md#basic-configuration)
	- [Example Projects](./getting-started.md#example-projects)

2. [Core Concepts](./core-concepts.md)
	- [Client-Server Separation](./core-concepts.md#client-server-separation)
	- [React Server Components](./core-concepts.md#react-server-components)
	- [Plugin Architecture](./core-concepts.md#plugin-architecture)

3. [Configuration](./configuration.md)
	- [Plugin Options](./configuration.md#plugin-options)
	- [Routing Configuration](./configuration.md#routing-configuration)
	- [Build Configuration](./configuration.md#build-configuration)

4. [CSS Handling](./css-handling.md)
	- [CSS Collectors](./css-handling.md#css-collectors)
	- [Inline CSS](./css-handling.md#inline-css)
	- [Custom CSS Processing](./css-handling.md#custom-css-processing)

5. [Server Actions](./server-actions.md)
	- [Creating Server Actions](./server-actions.md#creating-server-actions)
	- [Client Integration](./server-actions.md#client-integration)
	- [Error Handling](./server-actions.md#error-handling)
	- [Database Integration](./server-actions.md#database-integration)

6. [Static Site Generation](./static-site-generation.md)
	- [Static Plugin](./static-site-generation.md#static-plugin)
	- [Build Process](./static-site-generation.md#build-process)
	- [Deployment Strategies](./static-site-generation.md#deployment-strategies)

7. [Build Orchestration](./build-orchestration.md)
	- [Multiple Build Targets](./build-orchestration.md#multiple-build-targets)
	- [Plugin Architecture](./build-orchestration.md#plugin-architecture)
	- [Environment-Specific Builds](./build-orchestration.md#environment-specific-builds)

8. [Architecture](./architecture.md)
	- [Design Philosophy](./architecture.md#design-philosophy)
	- [Environment Variables](./architecture.md#environment-variables)
	- [Plugin Composition](./architecture.md#plugin-composition)
	- [HTML Component Support](./architecture.md#html-component-support)

9. [Advanced Topics](./advanced-topics.md)
	- [Custom Workers](./advanced-topics.md#custom-workers)
	- [Message System](./advanced-topics.md#message-system)
	- [Extending the Plugin](./advanced-topics.md#extending-the-plugin)

10. [API Reference](./api-reference.md)
	- [Plugin Options](./api-reference.md#plugin-options)
	- [Component Props](./api-reference.md#component-props)
	- [Worker Messages](./api-reference.md#worker-messages)
	- [Type Definitions](./api-reference.md#type-definitions)

11. [Transformations](./transformations.md)
	 - [Code Transformations](./transformations.md#code-transformations)
	 - [Directive Handling](./transformations.md#directive-handling)
	 - [Build Output Examples](./transformations.md#build-output-examples)

12. [Loader](./loader.md)
	 - [React Server Components Loader](./loader.md#react-server-components-loader)
	 - [Directive Processing](./loader.md#directive-processing)
	 - [Module Boundaries](./loader.md#module-boundaries)
	 - [Custom Registration Functions](./loader.md#custom-registration-functions)

13. [Patch System](./patch-system.md)
	 - [React Version Compatibility](./patch-system.md#react-version-compatibility)
	 - [Creating Patches](./patch-system.md#creating-patches)
	 - [Maintenance Guide](./patch-system.md#maintenance-guide)

14. [Practical Guide](./practical-guide.md)
	 - [Real-world Examples](./practical-guide.md#real-world-examples)
	 - [Debugging Features](./practical-guide.md#debugging-features)
	 - [Production Implementations](./practical-guide.md#production-implementations)

15. [Troubleshooting Guide](./troubleshooting-guide.md)
	 - [Common Issues](./troubleshooting-guide.md#common-issues)
	 - [Debugging Tips](./troubleshooting-guide.md#debugging-tips)
	 - [Performance Optimization](./troubleshooting-guide.md#performance-optimization)

### Quick Links
- [🏠 Main Documentation](./README.md)
- [🚀 Getting Started](./getting-started.md)
- [📖 GitHub Repository](https://github.com/nicobrinkkemper/vite-plugin-react-server)
- [🎮 Official Demo](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)

---

<!-- AUTO-GENERATED-TOC-END -->