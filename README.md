# Vite React Server Components Plugin

A Vite plugin that enables React Server Components (RSC) streaming and static building of html pages. Uses experimental dependencies from React, specifically `react-server-dom-esm`.

Temporary patch-package is included in this repository. Example project:

the [mmcelebration.com project](https://github.com/nicobrinkkemper/mmc) is using this plugin. The build time for this website of roughly 200 html pages is a couple of seconds - depending on your machine.

## Canary first development

This plugin was developed using the react version currrently hosted on the official react github repository. You can
only get this version of react-server-dom-esm by actually building react from source. There's a patch system included
that allows you to download the stub version of react-server-dom-esm and apply the patch to it.

```bash
npm install react-server-dom-esm
```
This package exists, but is empty! So, we need to patch it.

```bash
npx vite-react-stream/patch
```
This will do two things:
- Look for your installed react version
- Change the patch around so it matches your react version
- Writes a file to patches/react-server-dom-esm+YOUR-REACT-VERSION.patch
```bash
npm install patch-package --save-dev
```
Add to postinstall script in package.json: (you need to do this yourself)
```json
"postinstall": "patch-package"
```
Now anytime you run install, it will patch the react-server-dom-esm package. Wait until the package is released
and you can remove the patch-package script.

If you don't want to rely on this, you can also build react from source yourself and run `npm run link` where the package.json is, then `npm link react-server-dom-esm` where you need to use it. However, make sure to also link the react and react-dom package as well or the versions will mismatch (hence the patch-package system).

## Features

- 🚀 Super fast static build times
- 🔄 Use vite to create your personal meta-framework

## Installation

```bash
npm install vite-plugin-react-server
```

## Usage

Single vite.config.ts file for server and client build - though you can split it up if you want.
The import `import { viteReactStreamPlugin } from 'vite-plugin-react-server'` will import the
right client/server plugin based on the NODE_OPTIONS environment variable.

Checkout the [template directory](./template) for a complete example.


## Configuration
To keep the client and server build processes easy to seperate, I suggest creating two vite.config.ts files and import the config in both. Let's make the stream plugin config file and name it `.tsx`. Vite config files can't end with `.tsx` but our own files can.

```typescript
// vite.react-server.config.ts
import { defineConfig } from 'vite'
import type { Options } from 'vite-plugin-react-server'

// Custom router example
const createRouter = (file: 'props.ts' | 'Page.tsx') => (url: string) => {
  console.log(url)
  if(url.includes('bidoof'))
    return `src/page/bidoof/${file}`
  if(url === '/index.rsc')
    return `src/page/${file}`;
  return `src/page/404/${file}`;
}

export const streamPluginOptions: Options = {
  moduleBase: "src",
  Page: createRouter('Page.tsx'),
  props: createRouter('props.ts'),
  pageExportName: "Page",
  propsExportName: "props",
}
```
Now let's make the client build config file.
```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import { viteReactStreamPlugin } from 'vite-plugin-react-server/client'
import { streamPluginOptions } from './vite.react-server.config.js'


export default defineConfig({
  plugins: [
    viteReactStreamPlugin(streamPluginOptions)
  ]
})
```

And the server build config file:

```typescript
// vite.server.config.ts
import { defineConfig } from 'vite'
import { viteReactStreamPlugin } from 'vite-plugin-react-server/server'
import { streamPluginOptions } from './vite.react-server.config.js'

export default defineConfig({
  plugins: [
    viteReactStreamPlugin(streamPluginOptions)
  ]
})
```

```typescript
// vite.server.config.ts
import { viteReactStreamPlugin } from 'vite-plugin-react-server/server'
import { streamPluginOptions } from './vite.react.config.js'

export default defineConfig({
  plugins: [viteReactStreamPlugin(streamPluginOptions)]
})
```
```typescript
// vite.config.ts
import { viteReactStreamPlugin } from 'vite-plugin-react-server/client'
import { streamPluginOptions } from './vite.react.config.js'

export default defineConfig({
  plugins: [viteReactStreamPlugin(streamPluginOptions)]
})
```
Then in the package.json, add the scripts:

```json
"scripts": {
  "start": "NODE_OPTIONS=--conditions=react-server vite",
  "build": "npm run build:client && npm run build:server",
  "build:client": "vite build",
  "build:server": "NODE_OPTIONS=--conditions=react-server vite build --ssr --config vite.server.config.ts",
  "test:server": "NODE_OPTIONS=--conditions=react-server vitest --config vite.server.config.ts"
}
```

Unfortunately, you can not write jsx in the config file since vite does not support the `.tsx` extension - any other file will be fine and jsx works like you would expect.


## Server Components

Create server components in your pages directory:

```typescript
// src/page/pokemon/page.tsx
export function Page({ pokemon }) {
  return <div>Its a {pokemon.name}!</div>
}
```

## Page Props

Define props for your pages:

```typescript
// src/page/pokemon/props.ts
export const props = async () => {
  const res = await fetch("https://pokeapi.co/api/v2/pokemon-form/399/")
  return res.json()
}
```

## Client Entry

How to fetch the server component streams, I suggest to make a file like this:
```typescript
// src/createReactFetcher.tsx
import type { ReactNode } from "react";
import { createFromFetch } from "react-server-dom-esm/client.browser";
import { callServer } from "./callServer.js";

export function createReactFetcher({
  url = window.location.pathname,
  moduleBaseURL = "/src",
  headers = { Accept: "text/x-component" },
}: {
  url?: string;
  moduleBaseURL?: string;
  headers?: HeadersInit;
} = {}): Promise<ReactNode> {
  return createFromFetch(
    fetch(url, {
      headers: headers,
    }),
    {
      callServer: callServer,
      moduleBaseURL: new URL(moduleBaseURL, window.origin).href,
    }
  ) as Promise<ReactNode>;
}
```
then use it in your client entry file:
```typescript
// src/client.tsx
const Shell: React.FC<{
  data: React.Usable<unknown>;
}> = ({ data: initialServerData }) => {
  const [, startTransition] = useTransition();
  const [storeData, setStoreData] =
    useState<React.Usable<unknown>>(initialServerData);

  const navigate = useCallback((to: string) => {
    startTransition(() => {
      // Create new RSC data stream
      setStoreData(
        createReactFetcher({
          url: to + to.endsWith("/") ? "index.rsc" : "/index.rsc",
        })
      );
    });
  }, []);

  // Routing example, useEventListener would just use useEffect and window.addEventListener
  useEventListener("popstate", (e) => {
    if (e instanceof PopStateEvent) {
      if (e.state?.to) {
        return navigate(e.state.to);
      }
    } else {
      return navigate(window.location.pathname);
    }
  });

  const content = use(storeData);

  return <ErrorBoundary>{content as ReactNode}</ErrorBoundary>;
};
// Initialize the app
const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

const intitalData = createReactFetcher({
  url: "/index.rsc",
});

createRoot(rootElement).render(<Shell data={intitalData} />);
```

## HTML Template

For development, you can still use the html template - but 
you can provide your own Html function directly in the plugin options.
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link href="src/index.css" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/client.tsx"></script>
  </body>
</html>
```


## Production html templating

The optional Html component can be used to wrap the entire stream. This component is only
used for production builds - you can not rely on it for development. This is because,
during development we use vite's native html template and the stream will only contain
the page content's.

The Html component is quite powerful since it gets access to all the page props, the vite client manifest,
and the children of the stream.

```typescript
import React from "react";
import type { Manifest } from "vite";
import { Favicons } from "./layout/Favicons.js";
import { Head } from "./layout/Head.js";

export const Html = ({
  children,
  pageProps,
  manifest,
}: {
  children: React.ReactNode;
  pageProps: HtmlProps;
  manifest: Manifest;
}) => {
  if (process.env["NODE_ENV"] === "production") {
    return (
      <html>
        <head>
          <Head title={pageProps.title} />
          <meta name="description" content={pageProps.description} />
          <Favicons favicons={pageProps.favicons} />
        </head>
        <body>
          <div id="root">{children}</div>
        </body>
      </html>
    );
  }
  return <>{children}</>;
};

```

## Notes

- Requires `NODE_OPTIONS="--conditions=react-server"` for the Vite process
- CSS files are automatically collected and link tags emitted
- Components are streamed only when visited
- Supports both sync and async props, and all kinds of combinations I haven't tried or tested yet!

## License

MIT



