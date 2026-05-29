# Getting Started

## Install

```bash
npm install -D vite-plugin-react-server react@experimental react-dom@experimental
```

React from the **experimental** channel is required. Stable React 19.x is not yet supported — the vendored `react-server-dom-esm` reads taint-registry internals that only exist on the experimental channel. See [React Compatibility](./react-type-compatibility.md) for the full story. The ESM transport (`react-server-dom-esm`) is vendored — no separate install needed.

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

A top-of-file `"use client"` directive is enough — the `.client.` filename
suffix is **not** required. A first-party module that starts with
`"use client"` is detected, hosted, and emitted as a client chunk in the
static (`--app`) build exactly like a `.client.tsx` file:

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

Detection is by directive position (the directive must be at the very top of
the file, the same rule React enforces), not by a substring match — a module
that merely mentions the word "client" is not treated as a client component.
The `.client.` convention still works and is handy as a visual marker.

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
