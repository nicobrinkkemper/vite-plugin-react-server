# Why you need both the Client and Server plugin

The client and server plugin output to `dist/client` and `dist/server` respectively and should be build in this order. When the last step (server) is done and the bundle generation closes, it will generate static index.rsc and index.html files for all the configured routes.


# Module Loading Architecture

Module loading is handled differently depending on which plugin you use.

When using `import { vitePluginReactClient } from 'vite-plugin-react-server/client'`, you can run it like
a normal vite project. It will use modern esmodule syntax and preserve modules by default.
For the actual server plugin `import { vitePluginReactServer } from 'vite-plugin-react-server'`, I recommend a seperate build step
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
export default defineConfig(()=> {
  return {
    plugins: vitePluginReactClient(),
  }
});
```

### ./vite.server.config.ts

```ts
import { vitePluginReactServer } from "vite-plugin-react-server";
import { config } from "./my-react-config.js";
import { defineConfig } from "vite";
export default defineConfig(()=> {
  return {
    plugins: vitePluginReactServer(config),
  }
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
vite's devserver.ssrLoadModule to load modules and therefor support anything that vite supports. Hot-reloading
is only supported for client components, since those run in the browser. However, nothing stops the user from making their
own stream-update protocol - using vite's import.meta.hot.accept for example.


```sh
NODE_OPTIONS='--conditions react-server' npx vite --config vite.server.config.ts --build
```

Above should now output specific static html for each page in the dist/client directory. This client can, given the right entrypoint,
work as a static site.

```sh
dist/client/index.html
dist/client/index.rsc
dist/client/about/index.html
dist/client/about/index.rsc
```
