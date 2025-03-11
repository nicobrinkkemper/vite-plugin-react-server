# All configurations:

> Note: likely to change in the future, but these are all the allowed options and their intended function

### moduleBase

```ts
import type { StreamPluginOptions } from "vite-plugin-react-server";

const config = {
  moduleBase: "src", // required
```

`src` is a convention, you can name it however you want.

### moduleBasePath

```ts
  moduleBasePath: "", // default
```

`moduleBasePath` is used as the second argument to React's `renderToPipeableStream` for server-side rendering.

### moduleBaseURL

```ts
  moduleBaseURL: "", // default
```

`moduleBaseURL` is used to prefix imports. Defining this option opts out of relative imports in the browser. ie `../` becomes `https://my-url/`.

> Note: When deploying to a subdirectory (e.g., GitHub Pages), make sure moduleBaseURL matches your base path - or leave empty to opt in to relative paths.

### Page & props

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
... later
  Page: createRouter('page.tsx')
  props: createRouter('props.ts'),
  pageExportName: "Page",
  propsExportName: "props",
```

Basically a router for mapping urls to source code. It can be any implementation you want. The props is optional to use, but it's very powerful since anything it returns will be the props for the page component as well as be accessible in the Html component. If you didn't define a props router, you can still define the `props` in the Page file.

### Html

```tsx
  Html: ({children,pageProps: {title}})=>(
    <html>
      <head>
        <title>{title}</title>
      </head>
      <body>
        <div id="root">
          {children}
        </div>
      </body>
    </html>
  )
```

This defines the final wrapper around your Page in production. 


### build

```ts
  build: {
     pages: ["/","/about"]
     dir:    "dist",    // dist/**
     client: "client",  // **/client
     server: "server",  // **/server
     static: "static"   // **/static
     hash: "hash",      //  -[hash].js for client files
     preserveModulesRoot: true // remove moduleBase from build
  }
```

# Module Loading Architecture

Module loading is handled differently depending on which plugin you use.

When using `import { vitePluginReactClient } from 'vite-plugin-react-server/client'`, you can run it like
a normal vite project. It will use modern esmodule syntax and preserve modules by default.
For the actual server plugin `import { vitePluginReactServer } from 'vite-plugin-react-server'`, I recommend a separate build step
`NODE_OPTIONS="--conditions react-server" vite --config vite.config.server.ts`. Create a shared config file specifically
for React specific configurations - like this plugin - and use the same config for both the client and server. This way, you keep a centralized
config and easy escape hatches when you need customization.

## EXAMPLE SETUP

Example `package.json` setup:

```json
"scripts": {
  "build": "build:client && build:server",
  "dev": "NODE_OPTIONS='--conditions react-server' vite --config vite.server.config.ts",
  "dev:client": "vite",
  "build:server": "NODE_OPTIONS='--conditions react-server' vite --config vite.server.config.ts",
  "build:client": "vite"
}
```

### ./src/my-page.tsx

```tsx
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
  Html: ({ children, url }) => (
    <html>
      <title>{url}</title>
      <body>{children}</body>
    </html>
  ),
  build: {
    pages: ["/", "/about"],
  },
};
```

### ./vite.config.ts

```ts
import { vitePluginReactClient } from "vite-plugin-react-server/client";
import { config } from "./my-react-config.js";
import { defineConfig } from "vite";
export default defineConfig(() => {
  return {
    plugins: vitePluginReactClient(),
  };
});
```

### ./vite.server.config.ts

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

## Client plugin Hook Types

There will be several hooks registered to allow all the server-plugin features to work at runtime.
Handling of typescript is done by the `tsx` dependency. (same as vite)
React is handled using a customized version of react's node-loader, that is tailored to a more recent nodejs version (23.7).
It also directly adds postcss imports for .css files, so that the stream automatically
includes those files like you would expect css files to work in vite.

It requires nodejs version 23.7.0 or higher.

## Server plugin dev mode

When running the server plugin in dev mode, it will pipe the react stream directly to the response. This will use
vite's `ssrLoadModule` to load modules and therefor support anything that vite supports. Hot-reloading
is only supported for client components, since those run in the browser. However, nothing stops the user from making their
own stream-update protocol - using vite's import.meta.hot.accept for example.

```sh
vite build
NODE_OPTIONS='--conditions react-server' npx vite build --config vite.server.config.ts
```

Above should now output specific static html for each page in the dist/client directory. This client can, given the right entrypoint,
work as a static site.

```sh
dist/static/index.html
dist/static/index.rsc
dist/static/about/index.html
dist/static/about/index.rsc
```

Aside from generating these html and rsc files, it copies all client files to the static directory - which includes the public directory - just drag 'n drop the static folder to your host of choice.
