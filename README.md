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
<<<<<<< HEAD
import { getCondition } from "vite-plugin-react-server";
=======
import { getCondition } from "vite-plugin-react-server/config";
>>>>>>> main

if (getCondition() !== "react-server") {
  throw new Error("-10 poision damage");
}
```

Alternatively, you can pass the argument for the `react-` prefix to just get client or server back.

```typescript
<<<<<<< HEAD
import { getCondition } from "vite-plugin-react-server";
=======
import { getCondition } from "vite-plugin-react-server/config";
>>>>>>> main

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

const intitalData = createReactFetcher();

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
  build: [
    pages: ['/', '/404']
  ]
};
```

And that's how you can work with react server components using a familiar vite workflow.
If your app grows and you need more control, see the [docs](./docs) - check out the source code - and have fun building.

### Worker support

The client plugin uses the `rsc-worker` to create server side streams. The server plugin uses the `html-worker` to create client side html. If you don't want to use the rsc-worker, simply don't serve the plugin without the `react-server` condition. If you don't want to use the `html-worker` simply don't configure the `build.pages` option.

### Custom Worker

Both workers can be customized using the `htmlWorkerPath` and `rscWorkerPath` respectively. The paths will be used to create the workers instead of the prebuilt worker included with this plugin. If these paths are defined, they will be made part of your application build as well.

Keep in mind that, using your custom worker means interacting with the message system of this plugin during development/static generation process.

<<<<<<< HEAD
For more information on creating your custom workers, see [docs](/docs)

=======
>>>>>>> main
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

<<<<<<< HEAD
This plugin has two built-in React Component, each can be configured through the options to be your own component. Defining your custom React server components will affect the final production output, they won't be used during development.

- Html - used as the wrapper for production pages (use vite's `index.html` for the development wrapper and entry point for client files)
=======
This plugin built-in React Component that can be configured through the options to be your own component. Direct server component config inputs are not yet supported through worker threads.

- Html - used as the wrapper for production pages (use vite's `index.html` for the development wrapper and entry point for client files & global css)
>>>>>>> main
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

<<<<<<< HEAD
Is the recommended way for a more direct server pipeline that doesn't require a `rsc-worker`.
=======
A direct server pipeline that doesn't require a `rsc-worker`.
>>>>>>> main

To develop the app using the `rsc-worker`, simply run

```sh
vite
```

<<<<<<< HEAD
without the `react-server` condition.
=======
without the `react-server` condition. This will work a little bit differently under the hood, it can provide additional development support like error logging, metric events and custom rsc worker development.
>>>>>>> main

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
Page: (id) => join(id.replace("index.rsc", ""), "page.tsx");
```

Defines how pages are mapped to file paths.

```ts
props: (id) => join(id.replace("index.rsc", ""), "props.ts");
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
