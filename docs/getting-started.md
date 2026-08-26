# Getting Started

## Start from the starter

The fastest path: clone
[vprs-starter](https://github.com/nicobrinkkemper/vprs-starter), a minimal app
with file-based routes, a one-call client entry, and a per-route choice between
CDN snapshots and per-request rendering.

```bash
git clone https://github.com/nicobrinkkemper/vprs-starter
cd vprs-starter
npm install
npm run dev      # vite dev server
npm run build    # → dist/static (+ dist/client, dist/server, dist/server-edge)
npm run preview  # serve the prerendered dist/static
npm run edge     # render every route per request on :4401
```

One build serves a static CDN, Vercel, or a local server. The Vercel-specific
files (`api/`, `vercel.json`, `scripts/prepare-vercel.mjs`) are deletable
(retarget the `edge` script from `build:vercel` to plain `build` first); the
rest is host-agnostic. The starter pins the experimental React train (`react`,
`react-dom`, `react-server-loader` on the same React snapshot); the
from-scratch path below uses stable React.

## Start from scratch

### Install

```bash
npm install -D vite-plugin-react-server react react-dom react-server-loader
```

vprs runs on **stable React 19.2+** (`react` / `react-dom` at `^19.2.8`). The
RSC transport underneath is version-locked by the
[`react-server-loader`](https://www.npmjs.com/package/react-server-loader)
peer dependency, which you install alongside `react` / `react-dom` (the
command above covers stable). To switch to the experimental React train
(e.g. for correct CSS preloading), install all three at the exact snapshot
vprs's peer range names — one copy in your tree, no `overrides`. See
[React Compatibility](./react-type-compatibility.md) for the exact-version
command.

### Create a Page

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

### Configure Vite

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";

export default defineConfig({
  plugins: vitePluginReactServer({
    // The execution paradigm: "isolated" (worker owns react-server, no
    // process flag), "main" (react-server on the main thread, needs
    // NODE_OPTIONS='--conditions react-server'), or "edge".
    runner: "isolated",
    moduleBase: "src",
    Page: "src/page.tsx",
    props: "src/props.ts",
    build: { pages: ["/"] },
  }),
});
```

### Development Server

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build --app",
    "preview": "vite preview"
  }
}
```

The scripts match the declared runner. With `runner: "isolated"` (above) no
script carries a process flag: a worker thread owns react-server resolution,
and the main thread keeps the react-client context hydration needs. Declaring
`runner: "main"` instead puts react-server on the main thread — slightly
faster, better stack traces, React usable in `vite.config.ts` — and then
every script states the flag that topology requires:

```json
{
  "scripts": {
    "dev": "NODE_OPTIONS='--conditions react-server' vite",
    "build": "NODE_OPTIONS='--conditions react-server' vite build --app",
    "preview": "NODE_OPTIONS='--conditions react-server' vite preview"
  }
}
```

Runner and flag are validated against each other at config-resolve time, so a
mismatch is a loud error, not a silently different topology. Either way the
plugin spawns a worker for the mirrored half, so server components and client
hydration both always have their proper React context. See
[Architecture](./internals/architecture.md) for how the mirroring works.

```bash
npm run dev
# Open http://localhost:5173
```

### Build

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
├── server/       # Server ESM modules
└── server-edge/  # Single-isolate edge bundle (on by default; build.edge: false to skip)
```

### Deploy to GitHub Pages

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
    runner: "isolated",
    moduleBase: "src",
    moduleBaseURL: "/my-repo/",
    Page: "src/page.tsx",
    build: { pages: ["/"] },
  }),
});
```

### Add More Pages

```ts
// vite.config.ts
export default defineConfig({
  plugins: vitePluginReactServer({
    runner: "isolated",
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

### Add Client Components

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

#### What makes it a client component

The `"use client"` directive, and only that — the same rule as every other React
setup. The `.client.tsx` name above is a convention for human readers; it carries
no meaning to the build.

```tsx
// src/components/Counter.tsx   ← same component, plainer name
"use client";
import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

A file named `.client.tsx` *without* the directive is a server module, and you
get a build warning telling you to add one. (Leading whitespace, comments, and a
`"use strict"` prologue may sit above the directive; one placed after real code
does not count.)

```tsx
// src/page.tsx (a server component)
import { Counter } from "./components/Counter.js";
// ...renders <Counter /> as a client reference
```

#### Client entry

Most projects have an `index.html` with something like:

```html
<script type="module" src="/src/client.tsx"></script>
```

vprs leaves that file to Vite's normal entry-point discovery — you do **not** need to set `clientEntry`, even though the file may carry a `"use client"` directive. The `clientEntry` option still exists for advanced cases that don't go through `index.html`.

### Add an HTML Shell

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

### HMR

Nothing to set up: `startClient` (the one-line client entry from
[Routing](./routing.md#client-side-navigation)) wires RSC HMR along with
hydration and the client router — an edit to anything the server tree
imports refetches the current route's flight automatically: server
components, loaders, and the content they read (markdown through
`import.meta.glob(..., { query: "?raw" })`, JSON data), wherever it lives in
the project. Assembling the client entry by hand instead? `useRscHmr` from
`vite-plugin-react-server/utils` is the same hook `startClient` uses, and
`setupRscHmr()` is the non-React form (call it once in your entry; it
refetches the current page's flight on those edits).

## Next Steps

- [Routing](./routing.md) — point `routes: { dir }` at a folder and the file tree becomes your URL tree: dynamic params, per-segment loaders, nested layouts, and client-side `Link` navigation
- [Build Output](./build-output.md) — understand what you're deploying
- [Configuration](./configuration.md) — all plugin options
- [Examples](./examples.md) — static sites, dynamic servers, server actions
