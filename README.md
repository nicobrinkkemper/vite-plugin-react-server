# Vite React Server Components Plugin

A Vite plugin that enables React Server Components (RSC) without a full-stack framework. Uses experimental dependencies from React, specifically `react-server-dom-esm/server.node`.

Temporary patch is included in this repository. Example project:

the [mmcelebration.com project](https://github.com/nicobrinkkemper/mmc) is using this plugin. The build time for this website of roughly 200 html pages is a couple of seconds - depending on your machine.

To achieve a simple workflow, it uses a node worker thread to generate the html for the pages. The reason for this is that we need to keep the client and server build processes separate - yet streaming data towards each other. Running the worker avoids running a server for the build process - and as such doesn't need to run a server to export all the html pages.

## Features

- 🚀 Super fast static build times
- 🔄 Use vite to create your personal meta-framework

## Installation

```bash
npm install vite-plugin-react-server
```


## Usage

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import { viteReactStreamPlugin } from 'vite-plugin-react-server'

// Custom router example
const createRouter = (fileName: string) => (url: string) => {
  try {
    return new URL(`file://./src/page${url}/${fileName}`).pathname
  } catch (e) {
    return `src/page/404/${fileName}`
  }
};

export default defineConfig({
  plugins: [
    viteReactStreamPlugin({
      moduleBase: "/src",
      Page: createRouter("page.tsx"),
      props: createRouter("props.ts"),
      pageExportName: "Page",
      propsExportName: "props",
      build: {
        client: "dist/client",
        server: "dist/server",
        pages: ()=>["/"]
      },
    })
  ]
})
```
In package.json, add the scripts:

```json
"scripts": {
  "build": "NODE_OPTIONS=--conditions=react-server vite build",
  "start": "NODE_OPTIONS=--conditions=react-server vite --ssr"
}
```
This may be ugly but, it's the best way I can garrantee you that the react server components will work,
throughout the vite build process, and this allways you to inlcude react components and pass them directly to the config too!
```typescript
{
  Html: ()=>React.createElement("div", null, "Hello World")
}
```
Unfortunately, you can not write jsx in the config file since vite does not support the tsx extension - any other file will be fine and jsx works like you would expect.


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



