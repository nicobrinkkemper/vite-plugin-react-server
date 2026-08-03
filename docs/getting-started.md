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
npm install -D vite-plugin-react-server react react-dom
```

vprs runs on **stable React 19.2+** (`react` / `react-dom` at `^19.2.7`). The
`react-server-dom-esm` ESM transport is provided by the
[`react-server-loader`](https://www.npmjs.com/package/react-server-loader)
dependency, installed for you by every package manager — no extra step. To
switch to the experimental React train (e.g. for correct CSS preloading),
install all three at `@experimental` — `react@experimental`,
`react-dom@experimental`, `react-server-loader@experimental` — which npm
dedupes to a single copy. See
[React Compatibility](./react-type-compatibility.md).

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
    "dev:rsc": "NODE_OPTIONS='--conditions react-server' vite",
    "build": "vite build --app",
    "build:rsc": "NODE_OPTIONS='--conditions react-server' vite build --app",
    "preview": "vite preview"
  }
}
```

The plain and `:rsc` variants serve and build the same app — neither mode is
required. Whichever condition the main thread runs, the plugin spawns a worker
for the mirrored half, so server components and client hydration both always
have their proper React context. The `:rsc` variants put the react-server side
on the main thread: an optional optimization (slightly faster, better stack
traces). See [Architecture](./internals/architecture.md) for how the mirroring
works.

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
hydration and the client router — a server-component edit refetches the
current route's flight automatically. Assembling the client entry by hand
instead? `useRscHmr` from `vite-plugin-react-server/utils` is the same hook
`startClient` uses, and `setupRscHmr()` is the non-React form (call it once in
your entry; it refetches the current page's flight on server-component edits).

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

There are no 3.x migration notes: v3's additions (the file router's `routes`
field, the edge bundle) are additive, and a working 2.x config runs unchanged.

## Next Steps

- [Routing](./routing.md) — point `routes: { dir }` at a folder and the file tree becomes your URL tree: dynamic params, per-segment loaders, nested layouts, and client-side `Link` navigation
- [Build Output](./build-output.md) — understand what you're deploying
- [Configuration](./configuration.md) — all plugin options
- [Examples](./examples.md) — static sites, dynamic servers, server actions
