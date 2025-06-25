# All configurations:

> Note: likely to change in the future, but these are all the allowed options and their intended function

### moduleBase

```ts
import type { StreamPluginOptions } from "vite-plugin-react-server/types";

const config = {
  moduleBase: "src", // source prefix
```

`src` is a convention, you can name it however you want.

### moduleBasePath

```ts
  moduleBasePath: "/", // import prefix
```

`moduleBasePath` is used as the second argument to React's `renderToPipeableStream` for server-side rendering. Defaults to VITE_BASE_URL or "/"

### moduleBaseURL

```ts
  moduleBaseURL: "/", // url prefix
```

`moduleBaseURL` should be same as moduleBasePath in most cases. The url equivalant. Defaults to VITE_BASE_URL or "/"

> Note: When deploying to a subdirectory (e.g., GitHub Pages), make sure moduleBaseURL and moduleBasePath matches your base path - or leave empty and use VITE_BASE_URL.
```ts
publicOrigin: "", // URL parseable origin
```

`publicOrigin` should be used as a static replacement for location.origin. Defaults to VITE_PUBLIC_ORIGIN or ""

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
import React from "react";

Html: ({ Root, cssFiles, pageProps, Page }) => (
  <html>
    <head>
      <title>{pageProps?.title || "My App"}</title>
    </head>
    <body>
      <Root as="div" id="root" cssFiles={cssFiles} Page={Page} pageProps={pageProps} />
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

## EXAMPLE SETUP

Example `package.json` setup:

```json
"scripts": {
  "build": "build:client && build:server",
  "dev": "NODE_OPTIONS='--conditions react-server' vite",
  "dev:client": "vite",
  "build:server": "NODE_OPTIONS='--conditions react-server' vite build",
  "build:client": "vite build"
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
        <Root as="div" id="root" cssFiles={cssFiles} Page={Page} pageProps={pageProps} />
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


## Client plugin Hook Types

There will be several hooks registered to allow all the server-plugin features to work at runtime.
Handling of typescript is done by the `tsx` dependency. (same as vite)
React is handled using a customized version of react's node-loader, that is tailored to a more recent nodejs version (23.7).
It also directly adds postcss imports for .css files, so that the stream automatically
includes those files like you would expect css files to work in vite.

It requires nodejs version 23.7.0 or higher.

## Server plugin dev mode

When running the server plugin in dev mode, it will pipe the react stream directly to the response. This will use
vite's `ssrLoadModule` to load modules and therefor support anything that vite supports.  Hot-reloading
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