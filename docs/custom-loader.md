# Vite React Server Plugin

A Vite plugin that enables React Server Components (RSC) streaming and static HTML page generation. It leverages experimental dependencies from React, specifically `react-server-dom-esm`.

## Example Projects

- [The official demo](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)
  - [Github Pages](https://nicobrinkkemper.github.io/vite-plugin-react-server-demo-official/)
- [The mmcelebration.com project](https://github.com/nicobrinkkemper/mmc)
  - [Github Pages](https://nicobrinkkemper.github.io/mmc/)

## Installation

```sh
npm install -D vite-plugin-react-server
```

## Open Source and Work in Progress

This project uses the latest _OSS-experimental_ React version from [the official React GitHub repository](https://github.com/facebook/react). The plugin includes a patch system to facilitate setup. First, install dependencies and patches:

```sh
npm install -D patch-package react@experimental react-dom@experimental react-server-dom-esm
```

Add the following command to your `package.json` scripts:

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

This ensures the patch is applied after every `npm install`. If errors arise related to `react-server-dom-esm`, verify that the postinstall step ran.

---

## Plugin Structure and Purpose

### Environment-Based Execution

This plugin uses environment detection to determine the execution context. It achieves this by checking the `NODE_OPTIONS` environment variable:

```typescript
import { getCondition } from "vite-plugin-react-server/config";

if (getCondition() !== "react-server") {
  throw new Error("-10 poison damage");
}
```

Alternatively, you can pass the argument for the `react-` prefix to just get client or server back.

```typescript
import { getCondition } from "vite-plugin-react-server/config";

import(`plugin.${getCondition("")}.js`);
```

The main entry point adapts based on the environment:

- **Client Mode** (default) → Does not require the react-server condition, uses a worker thread for RSC requests
  Benefits:
  - log errors to console
  - onMetric event for each page
  - worker thread
- **Server Mode** (`NODE_OPTIONS="--conditions react-server"`) → Does not need worker thread for RSC requests
  - Direct pipeline from vite to react

### Custom composition

You can pick and choose only the plugins you like to get the desired behavior as well. For example, we can choose only to use the preserver, the transformer, static plugin, etc.

### Page & prop setup

The minimal config is

```tsx
// vite.config.tsx
import type { StreamPluginOptions } from "vite-plugin-react-server/types";
import { join } from "node:path";
import { defineConfig } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { config } from "./vite.react.config.js";

export default defineConfig(() => {
  return {
    plugins: vitePluginReactServer({
      moduleBase: "src",
      Page: "src/page.tsx",
    }),
  };
});
```

And our Page file.

```tsx
// src/page.tsx
import React from "react";
export function Page({ url }) {
  return <div>You are on {url}</div>;
}
```

Of course we need a client file as well, and the vite index.html pointing to it,

```tsx
import React, { use } from "react";
import { createRoot } from "react-dom/client";
import { createReactFetcher } from "vite-plugin-react-server/utils";
// src/client.tsx
const Shell: React.FC<{
  data: React.Usable<React.ReactNode>;
}> = ({ data: initialServerData }) => {
  const content = use(initialServerData);
  return content as React.ReactNode;
};
// Initialize the app
const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

const intitalData = createReactFetcher({
  url: window.location.pathname,
  moduleBaseURL: import.meta.env.BASE_URL,
  publicOrigin: import.meta.env.PUBLIC_ORIGIN,
});

createRoot(rootElement).render(<Shell data={intitalData} />);
```

index.html for completeness sake

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <body>
    <div id="root"></div>
    <script type="module" src="/src/client.tsx"></script>
  </body>
</html>
```

By default, without any prop configurations, the Page receives a normalized url.

With custom "get prop" function, we can enrich the props with more information.

```tsx
import React from "react";

export const props = (url) => ({ title: "Hello World", file: import.meta.url, url });

export type Props = ReturnType<typeof props>

export function Page({ file, title, url }: Props) {
  return <>
     <title>{title}<title>
     <div>This file is here: {file}</div>;
     <div>You are on: {url}</div>;
   </>
}
```

You can also define a router specifically for the props file.

```tsx
{
  moduleBase: "src",
  Page: "src/page.tsx",
  // define the props router
  props: "src/props.ts",
}
```

Move prop lines from `src/page.tsx` to `src/props.ts`

```tsx
export const props = (url) => ({
  title: "Hello World",
  file: import.meta.url,
  url,
});

export type Props = ReturnType<typeof props>;
```

We can also make a static build for these pages, which will render them to index.html and headless index.rsc files, which can be used to make a static RSC site.

```tsx
{
  moduleBase: "src",
  Page: "src/page.tsx",
  props: "src/props.ts"
  // define the routes we want to render
  build: {
    pages: ['/', '/404']
  }
};
```

And that's how you can work with react server components using a familiar vite workflow.
If your app grows and you need more control, see the [docs](./docs) - check out the source code - and have fun building.

### Worker support

The client plugin uses the `rsc-worker` to create server side streams. The server plugin uses the `html-worker` to create client side html. If you don't want to use the rsc-worker, simply don't serve the plugin without the `react-server` condition. If you don't want to use the `html-worker` simply don't configure the `build.pages` option.

### Custom Worker

Both workers can be customized using the `htmlWorkerPath` and `rscWorkerPath` respectively. The paths will be used to create the workers instead of the prebuilt worker included with this plugin. If these paths are defined, they will be made part of your application build as well.

Keep in mind that, using your custom worker means interacting with the message system of this plugin during development/static generation process.

## Plugin Usage

```ts
import { defineConfig, type Plugin } from "vite";
import { vitePluginReactClient } from "vite-plugin-react-server";
import { config } from "./vite.react.config";
import type { StreamPluginOptions } from "vite-plugin-react-server/server";

const createRouter = (file: "props.ts" | "page.tsx") => (url: string) => {
  switch (url) {
    case "/":
      return `src/page/${file}`;
    case "/bidoof":
      return `src/page/bidoof/${file}`;
    case "/404":
    default:
      return `src/page/404/${file}`;
  }
};

export const config = {
  moduleBase: "src",
  Page: createRouter("page.tsx"),
  props: createRouter("props.ts"),
  Html: Html,
  build: {
    pages: ["/", "/bidoof", "/404"],
  },
} satisfies StreamPluginOptions;

export default defineConfig({
  plugins: vitePluginReactClient(config),
});
```

This will mirror your directory structure for new static routes. If you need to handle
dynamic requests, like pointing /:theme/ to a certain folder, you need to parse this yourself
using code.

### Async build pages

If you have a large amount of pages that needs async operations to fetch, you can pass a async function to build pages.

```tsx
build:{
  pages: async ()=>await import('my-pages')
}
```

### Built-in React Server Components

This plugin built-in React Component that can be configured through the options to be your own component. Direct server component config inputs are not yet supported through worker threads.

- Html - used as the wrapper for production pages (use vite's `index.html` for the development wrapper and entry point for client files & global css)
- CssCollector - used to emit `<link>` and `<style>` tags based on `css` config

Defining your custom Html React server component will affect the final production output.

#### Build Steps

```sh
vite build
```

Targets browsers, outputs to `dist/static`.

```sh
vite build --ssr
```

Targets non-`react-server` node environment, used for server-side-rendering, outputs to `dist/client`.

```sh
NODE_OPTIONS="--conditions=react-server" vite build
```

Targets `react-server`-only environment, outputs to `dist/server`. In this case, `ssr` is implied and defaults to true.

---

### vite-plugin-react-server

```ts
import { defineConfig, Plugin } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { config } from "./vite.react.config";

export default defineConfig({
  plugins: vitePluginReactServer(config),
});
```

#### Running in Development

```sh
NODE_OPTIONS="--conditions=react-server" vite
```

A direct server pipeline that doesn't require a `rsc-worker`.

To develop the app using the `rsc-worker`, simply run

```sh
vite
```

without the `react-server` condition. This will work a little bit differently under the hood, it can provide additional development support like error logging, metric events and custom rsc worker development.

## Static Site Generation

Single-out the static generation step by only inluding the static plugin. Expects client and server folders to be there.

```ts
import { defineConfig, Plugin } from "vite";
import { reactStaticPlugin } from "vite-plugin-react-server/static";
import { config } from "./vite.react.config";

export default defineConfig({
  plugins: [reactStaticPlugin(config)],
});
```

Example output structure:

```sh
dist/static/index.html
dist/static/index.rsc
dist/static/about/index.html
dist/static/about/index.rsc
```

This plugin is included by default when the `react-server` condition is set.

---

## Configuration

### moduleBase

```ts
const config = {
  moduleBase: "src",
};
```

Defines the root directory for project modules. This can be customized.

### moduleBasePath

```ts
moduleBasePath: "/",
```

Passed as the second argument to `renderToPipeableStream` for server-side rendering.

### moduleBaseURL

```ts
moduleBaseURL: "/",
```

Defines asset URL resolution for CSS collectors and bootstrapModule.

```ts
publicOrigin: "https://github.com",
```

### Page and props Mapping

```ts
Page: (id) => join('src', id, "page.tsx");
```

Defines how pages are mapped to file paths.

```ts
props: (id) => join('src', id, "props.ts");
```

Defines how to load the initial props of the page file.

If you do not want prop files, just don't define it.

```ts
pageExportName: 'Page',
```

Changes the default name "Page"

```ts
propsExportName: 'props',
```

Changes the default name "props"

---

## Example Setup

### package.json Scripts

```json
"scripts": {
  "build": "build:static && build:client && build:server",
  "dev": "NODE_OPTIONS='--conditions react-server' vite",
  "start": "vite",
  "build:server": "NODE_OPTIONS='--conditions react-server' vite build",
  "build:client": "vite build --ssr",
  "build:static": "vite build"
}
```

### Sample Page Component

```tsx
// src/my-page.tsx
export const Page = ({ name }) => {
  return <div>Hello {name}</div>;
};
// src/async-page.tsx
export const Page = async ({ name }) => {
  return <div>Hello {name}</div>;
};
```

### Sample Props File

All of the below are valid

```ts
// src/my-props.ts
export const props = {
  name: "John Doe",
};
export const props = (url)=>{
  name: "John Doe",
};
export const props = async (url)=>{
  name: "John Doe",
}
// enum bonus
export const props = ['key']; // -> {key: "key"}
// Object.fromEntries()
export const props = [['key',{value: 'some value'}]]
```

## Contributions

If you want to help develop or maintain the plugin feel free to open a PR or issue on GitHub.

---

# Custom React Loader

The plugin provides extensive customization options for how React directives are processed and transformed. This allows you to integrate with different React Server Components implementations, customize registration functions, and adapt the loader to your specific needs.

## Overview

The custom loader system allows you to:

- **Use different RSC implementations** (webpack, turbopack, custom)
- **Customize import paths** for registration functions
- **Override directive detection patterns** 
- **Configure environment-specific behavior**
- **Add custom validation logic**

## Basic Configuration

### Custom Import Paths

The most common customization is changing where registration functions are imported from:

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";

export default defineConfig({
  plugins: vitePluginReactServer({
    loader: {
      // Use webpack-based RSC implementation
      importServerPath: "react-server-dom-webpack/server",
      importClientPath: "react-server-dom-webpack/client",
      
      // Or use turbopack
      // importServerPath: "react-server-dom-turbopack/server",
      // importClientPath: "react-server-dom-turbopack/client",
    }
  }),
});
```

### Custom Registration Function Names

Some RSC implementations use different function names:

```typescript
export default defineConfig({
  plugins: vitePluginReactServer({
    loader: {
      registerServerReferenceName: "createServerReference",
      registerClientReferenceName: "createClientReference",
    }
  }),
});
```

## Environment-Specific Configuration

The loader automatically adapts to different environments, but you can override this:

```typescript
export default defineConfig({
  plugins: vitePluginReactServer({
    loader: {
      mode: "development", // or "production" | "test"
      
      // Development uses .node extensions for better debugging
      importServerPath: "react-server-dom-esm/server.node",
      importClientPath: "react-server-dom-esm/server.node",
    }
  }),
});
```

**Default Environment Behavior:**
- **Development**: Uses `.node` extensions for better error messages
- **Production**: Uses standard paths for optimal bundling
- **Test**: Uses `.node` extensions for consistent testing

## Advanced Customization

### Custom Directive Detection

You can customize how the loader detects server and client code:

```typescript
export default defineConfig({
  plugins: vitePluginReactServer({
    loader: {
      // Custom patterns for detecting server/client code
      isServerFunctionCode: (code: string, moduleId?: string) => {
        // Custom logic for detecting server functions
        return code.includes('"use server"') || 
               moduleId?.includes('.server.') ||
               moduleId?.includes('/api/');
      },
      
      isClientComponentCode: (code: string, moduleId?: string) => {
        // Custom logic for detecting client components
        return code.includes('"use client"') ||
               moduleId?.includes('.client.') ||
               moduleId?.includes('/components/');
      },
    }
  }),
});
```

### Custom Parser

For specialized TypeScript/JSX processing:

```typescript
import { parse } from 'acorn';
import { transformWithEsbuild } from 'vite';

export default defineConfig({
  plugins: vitePluginReactServer({
    loader: {
      parse: async (source: string) => {
        // Custom parsing logic
        const result = await transformWithEsbuild(source, 'file.tsx', {
          loader: 'tsx',
          target: 'es2022',
        });
        
        return {
          ast: parse(result.code, { 
            ecmaVersion: 'latest', 
            sourceType: 'module' 
          }),
          code: result.code,
          map: result.map,
        };
      }
    }
  }),
});
```

## Real-World Examples

### Next.js Compatibility

Configure the loader to work with Next.js RSC:

```typescript
export default defineConfig({
  plugins: vitePluginReactServer({
    loader: {
      importServerPath: "react-server-dom-webpack/server.edge",
      importClientPath: "react-server-dom-webpack/client.edge",
      registerServerReferenceName: "registerServerReference",
      registerClientReferenceName: "registerClientReference",
      
      // Next.js uses different patterns
      isServerFunctionCode: (code, moduleId) => {
        return code.includes('"use server"') || 
               moduleId?.endsWith('.server.js') ||
               moduleId?.includes('/app/') && !moduleId?.includes('/components/');
      },
    }
  }),
});
```

### Remix Integration

For Remix-style server functions:

```typescript
export default defineConfig({
  plugins: vitePluginReactServer({
    loader: {
      importServerPath: "react-server-dom-esm/server",
      importClientPath: "react-server-dom-esm/client",
      
      // Remix patterns
      isServerFunctionCode: (code, moduleId) => {
        return code.includes('"use server"') ||
               moduleId?.includes('.server.') ||
               moduleId?.includes('/routes/') && code.includes('export async function');
      },
    }
  }),
});
```

### Custom RSC Implementation

For your own RSC implementation:

```typescript
export default defineConfig({
  plugins: vitePluginReactServer({
    loader: {
      importServerPath: "./lib/my-rsc/server",
      importClientPath: "./lib/my-rsc/client",
      registerServerReferenceName: "createServerAction",
      registerClientReferenceName: "createClientComponent",
      
      // Custom validation
      isServerFunctionCode: (code, moduleId) => {
        // Your custom logic here
        return code.includes('@server') || moduleId?.includes('_server');
      },
    }
  }),
});
```

## Transformation Examples

### Example Transformations

The loader transforms modules differently depending on the **environment** (client vs server):

#### Server Environment

**Client Component (becomes error-throwing stub):**
```typescript
// Input: Counter.client.tsx
"use client";
export function Counter() { return <div>count</div>; }

// Output: Error-throwing client reference
import { registerClientReference } from "react-server-dom-esm/server";
export const Counter = registerClientReference(function() { throw new Error("Attempted to call Counter() from the server but Counter is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component."); }, "Counter.client.tsx", "Counter");
```

**Server Action (stays as-is with registration):**
```typescript
// Input: actions.server.ts
"use server";
export async function createUser(data: FormData) {
  return { success: true };
}

// Output: Registered server function
import { registerServerReference } from "react-server-dom-esm/server";


export async function createUser(data: FormData) {
  return { success: true };
}

registerServerReference(createUser, "/actions.server.js", "createUser");
```

#### Client Environment

**Client Component (runs as-is):**
```typescript
// Input: Counter.client.tsx  
"use client";
export function Counter() { return <div>count</div>; }

// Output: No transformation - runs directly
"use client";
export function Counter() { return <div>count</div>; }
```

**Server Action (becomes error-throwing stub):**
```typescript
// Input: actions.server.ts
"use server";
export async function createUser(data: FormData) {
  return { success: true };
}

// Output: Error-throwing server reference
import { registerServerReference } from "react-server-dom-esm/client";
export const createUser = registerServerReference(function() { throw new Error("Attempted to call createUser() on the client"); }, "actions.server.ts", "createUser");
```

## Testing Custom Loaders

Create test configurations for different scenarios:

```typescript
// test/custom-loader.test.ts
import { createTransformer } from "vite-plugin-react-server/loader";

const customLoaderConfig = {
  importServerPath: "my-custom-rsc/server",
  importClientPath: "my-custom-rsc/client",
  registerServerReferenceName: "myRegisterServer",
  registerClientReferenceName: "myRegisterClient",
  mode: "test",
};

const transformer = createTransformer({ 
  options: { 
    loader: customLoaderConfig,
    verbose: false 
  }
});

// Test your custom configuration
const result = await transformer(code, "test.ts");
expect(result.code).toContain('my-custom-rsc/server');
```

## Debugging Custom Loaders

Enable verbose logging to debug loader behavior:

```typescript
export default defineConfig({
  plugins: vitePluginReactServer({
    verbose: true, // Enable detailed logging
    loader: {
      // Your custom configuration
    }
  }),
});
```

This will output detailed information about:
- Module resolution
- Directive detection
- Transformation steps
- Registration function calls

## Common Patterns

### File-Based Routing

Automatically detect server/client based on file structure:

```typescript
loader: {
  isServerFunctionCode: (code, moduleId) => {
    return code.includes('"use server"') ||
           moduleId?.includes('/api/') ||
           moduleId?.includes('/server/') ||
           moduleId?.endsWith('.server.ts');
  },
  
  isClientComponentCode: (code, moduleId) => {
    return code.includes('"use client"') ||
           moduleId?.includes('/components/') ||
           moduleId?.includes('/ui/') ||
           moduleId?.endsWith('.client.tsx');
  },
}
```

### Monorepo Support

Handle different packages in a monorepo:

```typescript
loader: {
  isServerFunctionCode: (code, moduleId) => {
    return code.includes('"use server"') ||
           moduleId?.includes('packages/server/') ||
           moduleId?.includes('apps/api/');
  },
  
  isClientComponentCode: (code, moduleId) => {
    return code.includes('"use client"') ||
           moduleId?.includes('packages/ui/') ||
           moduleId?.includes('apps/web/');
  },
}
```

## Error Handling

Custom loaders should handle errors gracefully:

```typescript
loader: {
  parse: async (source: string) => {
    try {
      // Your custom parsing logic
      return { ast, code, map };
    } catch (error) {
      console.error('Custom parser error:', error);
      // Fallback to default parser
      throw error;
    }
  }
}
```

## Performance Considerations

- **Caching**: Custom detection functions are called frequently - keep them fast
- **Regex Patterns**: Pre-compile regex patterns outside the functions
- **File System**: Avoid file system operations in detection functions

```typescript
// ✅ Good: Pre-compiled patterns
const SERVER_PATTERN = /\.(server|api)\./;
const CLIENT_PATTERN = /\.(client|component)\./;

loader: {
  isServerFunctionCode: (code, moduleId) => {
    return code.includes('"use server"') || 
           (moduleId && SERVER_PATTERN.test(moduleId));
  }
}

// ❌ Bad: Creating regex on every call
loader: {
  isServerFunctionCode: (code, moduleId) => {
    return code.includes('"use server"') || 
           (moduleId && /\.(server|api)\./.test(moduleId));
  }
}
```

## Integration with Build Tools

### Webpack Integration

```typescript
// For webpack-based builds
loader: {
  importServerPath: "react-server-dom-webpack/server",
  importClientPath: "react-server-dom-webpack/client",
}
```

### Rollup Integration

```typescript
// For Rollup-based builds  
loader: {
  importServerPath: "react-server-dom-esm/server",
  importClientPath: "react-server-dom-esm/client",
}
```

The custom loader system provides the flexibility to adapt the plugin to virtually any React Server Components implementation or build setup while maintaining type safety and performance.

