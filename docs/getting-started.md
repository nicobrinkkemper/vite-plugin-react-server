# Getting Started

## Install

```bash
npm install -D vite-plugin-react-server react react-dom
```

vprs 2.0 runs on **stable React 19.2+** (`react` / `react-dom` at `^19.2.7`).
The `react-server-dom-esm` ESM transport is provided by the
[`react-server-loader`](https://www.npmjs.com/package/react-server-loader)
dependency (installed automatically) — you don't install a transport or an
experimental React build yourself. If you want the newest RSC features you can
still run on experimental React; see
[React Compatibility](./react-type-compatibility.md).

## Upgrading from 1.x

vprs 1.x required `react@experimental` and bundled the transport in-repo. For
2.0:

- **Switch to stable React:** `npm install react@^19.2.7 react-dom@^19.2.7`
  (experimental still works, but is no longer required).
- **The transport moved.** `react-server-dom-esm` now ships inside the
  `react-server-loader` dependency. If you imported the transport through vprs's
  `vite-plugin-react-server/react-server-dom-esm/*` self-export, import it from
  [`react-server-loader`](https://www.npmjs.com/package/react-server-loader)
  instead (e.g. `react-server-loader/server`, `/client`). Bare
  `react-server-dom-esm/*` imports inside a vprs app keep working — the plugin
  resolves them.
- **No API changes** to the plugin itself: your `vite.config`, page files, and
  directives are unchanged.

## Create a Page

```tsx
// src/page.tsx
export const Page = ({ title }: { title: string }) => (
  <div>
    <h1>{title}</h1>
    <p>Welcome to my app!</p>
  </div>
);
```

```ts
// src/props.ts
export const props = { title: "Home Page" };
```

## Configure Vite

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";

export default defineConfig({
  plugins: vitePluginReactServer({
    moduleBase: "src",
    Page: "src/page.tsx",
    props: "src/props.ts",
    build: { pages: ["/"] },
  }),
});
```

## Development Server

```json
{
  "scripts": {
    "dev": "vite",
    "dev:rsc": "NODE_OPTIONS='--conditions react-server' vite",
    "build": "NODE_OPTIONS='--conditions react-server' vite build --app",
    "preview": "vite preview"
  }
}
```

Both `dev` and `dev:rsc` serve the same app. The difference is internal — see [Architecture](./internals/architecture.md) if you're curious.

```bash
npm run dev
# Open http://localhost:5173
```

## Build

```bash
npm run build
```

Output:

```
dist/
├── static/       # Deploy this folder
│   ├── index.html
│   └── index.rsc
├── client/       # Client ESM modules
└── server/       # Server ESM modules
```

## Deploy to GitHub Pages

The `dist/static/` folder is a complete static site. Deploy it anywhere.

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "23"
      - run: npm ci
      - run: npm run build
      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist/static
```

For GitHub Pages with a subdirectory, set `moduleBaseURL` and Vite's `base`:

```ts
export default defineConfig({
  base: "/my-repo/",
  plugins: vitePluginReactServer({
    moduleBase: "src",
    moduleBaseURL: "/my-repo/",
    Page: "src/page.tsx",
    build: { pages: ["/"] },
  }),
});
```

## Add More Pages

```ts
// vite.config.ts
export default defineConfig({
  plugins: vitePluginReactServer({
    moduleBase: "src",
    Page: (url) => `src/pages${url}page.tsx`,
    props: (url) => `src/pages${url}props.ts`,
    build: { pages: ["/", "/about/", "/contact/"] },
  }),
});
```

```
src/pages/
├── page.tsx           # /
├── props.ts
├── about/
│   ├── page.tsx       # /about/
│   └── props.ts
└── contact/
    ├── page.tsx       # /contact/
    └── props.ts
```

## Add Client Components

```tsx
// src/components/Counter.client.tsx
"use client";
import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

```tsx
// src/page.tsx
import { Counter } from "./components/Counter.client.js";

export const Page = () => (
  <div>
    <h1>Home</h1>
    <Counter />
  </div>
);
```

### The `.client.` filename is optional

vprs recognises a file as a client module when **either** of these is true:

- the filename matches `(^|[\/.])client\.[cm]?[jt]sx?$` — i.e. `Button.client.tsx`, `bar.client.mjs`, or the standalone basename `src/client.tsx` / `client.tsx`, or
- the file starts with a top-of-file `"use client"` directive (leading whitespace, line/block comments, and an optional `"use strict"` prologue are tolerated above it).

Either is sufficient. Substrings like `clientUtils.tsx`, `clientId.ts`, or `clients.tsx` are **not** treated as client modules, and a `"use client"` directive placed after real code does not count.

```tsx
// src/components/Counter.tsx  ← no `.client.` suffix
"use client";
import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

```tsx
// src/page.tsx (a server component)
import { Counter } from "./components/Counter.js";
// ...renders <Counter /> as a client reference
```

### Client entry

Most projects have an `index.html` with something like:

```html
<script type="module" src="/src/client.tsx"></script>
```

vprs leaves that file to Vite's normal entry-point discovery — you do **not** need to set `clientEntry`, even though the file may carry a `"use client"` directive. The `clientEntry` option still exists for advanced cases that don't go through `index.html`.

## Add an HTML Shell

```tsx
// src/Html.tsx
import { Css } from "vite-plugin-react-server/components";
import type { HtmlProps } from "vite-plugin-react-server/types";

export const Html = ({ Root, cssFiles, globalCss, pageProps, Page }: HtmlProps) => (
  <html>
    <head>
      <Css cssFiles={globalCss} />
      <title>{pageProps?.title || "My App"}</title>
    </head>
    <body>
      <Root as="div" id="root" cssFiles={cssFiles} Page={Page} pageProps={pageProps} />
    </body>
  </html>
);
```

```ts
// vite.config.ts — add Html option
vitePluginReactServer({
  // ...
  Html: "src/Html.tsx",
})
```

## HMR Setup

For automatic RSC refetching when server components change:

```tsx
// Client entry
import { createReactFetcher, setupRscHmr } from "vite-plugin-react-server/utils";

const { initialContent, refetch } = createReactFetcher({ callServer });

if (import.meta.hot) {
  setupRscHmr(import.meta.hot, refetch);
}
```

## Next Steps

- [Build Output](./build-output.md) — understand what you're deploying
- [Configuration](./configuration.md) — all plugin options
- [Examples](./examples.md) — static sites, dynamic servers, server actions
