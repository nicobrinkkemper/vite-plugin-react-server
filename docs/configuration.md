# Configuration

> Note: likely to change in the future, but these are all the allowed options and their intended function

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

## Component Configuration

### Page & Props (Path-based Resolution)

```ts
const createRouter = (file: "props.ts" | "page.tsx") => (url: string) => {
  switch (url) {
    case "/bidoof":
    case "/bidoof/index.rsc":
      return `src/page/bidoof/${file}`;
    case "/404":
    case "/404/index.rsc":
      return `src/page/404/${file}`;
    case "/":
      // production
    case "/index.rsc":
      // development
      return `src/page/${file}`;
    default:
      throw new Error(`Unknown route: ${url}`);
  }
};

// later
Page: createRouter('page.tsx')
props: createRouter('props.ts'),
pageExportName: "Page",
propsExportName: "props",
```

Basically a router for mapping urls to source code. It can be any implementation you want. The props is optional to use, but it's very powerful since anything it returns will be the props for the page component as well as be accessible in the Html component. If you didn't define a props router, you can still define the `props` in the Page file.

### Direct Component References

When the environment allows, you can override the components using the `components` key:

```tsx
import React from "react";

export const config = {
  moduleBase: 'src',
  components: {
    Html: ({ Root, cssFiles, pageProps, Page }) => (
      <html>
        <head>
          <title>{pageProps?.title || "My App"}</title>
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
    ),
    Page: ({ title }) => <div>Hello {title}</div>, // Direct component
  }
} satisfies StreamPluginOptions;
```

This defines the final wrapper around your Page in production.

### Component Resolution Priority

The plugin resolves components in this order:

1. **Direct components** (`components.Page`, `components.Html`, `components.Root`) - Used in static builds
2. **Path resolution** (`Page`, `Html`, `Root` strings/functions) - Used in RSC worker mode  
3. **Default components** - Plugin fallbacks

### When to Use Each Approach

#### Path-based Resolution (`Page`, `Html`, `Root`)

**Use when:**
- Development mode with hot reloading
- RSC worker mode
- Dynamic component loading
- When you want the plugin to handle file resolution

```ts
export const config = {
  Page: (url) => `src/page${url}/page.tsx`,
  Html: "src/CustomHtml.tsx",
  Root: "src/CustomRoot.tsx",
} satisfies StreamPluginOptions;
```

#### Direct Component References (`components.Page`, `components.Html`, `components.Root`)

**Use when:**
- Static builds
- When you want to avoid file resolution overhead
- When you need to provide components directly

```ts
import { CustomPage } from "./src/CustomPage";
import { CustomHtml } from "./src/CustomHtml";

export const config = {
  components: {
    Page: CustomPage,
    Html: CustomHtml,
  }
} satisfies StreamPluginOptions;
```

### build

```ts
  moduleBase: 'src',
  Page: 
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

## EXAMPLE SETUP

Example `package.json` setup:

```json
"scripts": {
  "build": "build:client && build:server",
  "dev": "NODE_OPTIONS='--conditions react-server' vite",
  "dev:client": "vite",
  "build:server": "NODE_OPTIONS='--conditions react-server' vite build",
  "build:client": "vite build --ssr",
  "build:static": "vite build"
}
```

> For `NODE_OPTIONS='--conditions react-server' vite build`, the `--ssr` is implied (default)

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

## Client plugin

The server command enables the rsc-worker development mode. The plugin will handle sending messages to the worker and the rsc-worker handles the React server paradigm using familiar vite defaults. The worker receices the plugin's and vite's own resolved configuration. Functions are removed from the objects before sending them to the worker.

Functions defined in the config will never reach the worker. The string results of the Page, props, Root and Html functions are send with each RSC_RENDER message and are called in the main thread. Vite's resolved config is as the third argument for processCss.

```typescript
// css-loader.tsx
import { preprocessCSS, resolveConfig } from "vite";
import { workerData } from "node:worker_threads";

const viteConfig = await resolveConfig(
  {
    ...workerData.resolvedConfig,
    // do-not re-resolve the config file as it would import the plugin again which we do not need.
    configFile: false,
  },
  "serve"
);
function processCssFile(file: string) {
  // Convert file URL to path if needed
  const path = filePath.startsWith("file://")
    ? fileURLToPath(filePath)
    : filePath;

  // Process CSS using Vite's preprocessCSS
  return await preprocessCSS(await readFile(path, "utf-8"), path, viteConfig);
}
```

The worker thread registers hooks to support TypeScript, css modules and react server components.
Handling of TypeScript is done by the `tsx` dependency. (same as vite)
React is handled using a customized version of react's node-loader, that is tailored to a more recent nodejs version (23.7). The css loader is fine-tuned to work with the aforementioned preprocessCSS function.

It requires NodeJS version 23.7.0 or higher.

## Server plugin

When running the server plugin in dev mode, it will pipe the react stream directly to the response. This will use
vite's `ssrLoadModule` to load modules and therefor support anything that vite supports. Hot-reloading
is supported for defined route files, hot module replacement is only supported for client-side modules.

```sh
vite build
NODE_OPTIONS='--conditions react-server' npx vite build
```

Above should now output specific static html for each page in the dist/client directory. This client can, given the right entrypoint,
work as a static site.

```sh
dist/static/index.html
dist/static/index.rsc
dist/static/about/index.html
dist/static/about/index.rsc
```

For an example of this, see the demo.

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
3.	**[Configuration](./configuration.md) ← you are here**
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

