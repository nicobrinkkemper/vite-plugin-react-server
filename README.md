# vite-plugin-react-server

React Server Components as a Vite plugin. One `vite build --app` prerenders your
pages to static HTML + RSC payloads and emits your components as portable ESM
that runs under any HTTP server: static hosting, Express/Hono, or anything in
between.

📖 **<a href="https://nicobrinkkemper.github.io/vite-plugin-react-server/" target="_blank" rel="noopener">Documentation site →</a>**
— the full docs, and itself a vprs app (the site dogfoods the plugin).

vprs is the low-level layer rather than a framework: it handles the RSC
transform, runs the worker threads, and emits portable ESM — and leaves app
structure to you. Routing is covered if you want it: since v3 an opt-in
[file-based router](./docs/routing.md) (dynamic params, nested layouts,
per-segment loaders, client-side `Link`) ships in the box, or map URLs to files
yourself. Use it directly, or as the engine under your own conventions. Its
closest peer is the official
[`@vitejs/plugin-rsc`](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-rsc);
vprs differs by being a small dev/build setup whose output is portable ESM you
host yourself. (The RSC transport underneath is an implementation detail —
supplied and version-locked by `react-server-loader`.) For a batteries-included
framework instead, see Waku or Vike. Full breakdown:
[How vprs compares](./docs/comparison.md).

It runs in both Node module conditions by design: the dev server and the build
work with or without `--conditions react-server`, and a worker thread mirrors
whichever half your main thread isn't on (server components need a react-server
context, client hydration a react-client one). Running the main thread under
react-server is an optional optimization — a bit faster, better stack traces —
never a requirement.

## Install

```bash
npm install -D vite-plugin-react-server react react-dom
```

vprs runs on **stable React 19.2+** out of the box — and on experimental React
too. Everything locked to a React version (the `react-server-dom-esm` transport
that ships on both the server and your browser bundle, the directive engine, the
Node loader) lives in the
[`react-server-loader`](https://www.npmjs.com/package/react-server-loader)
dependency, whose versions track React the way `@types/react` does. You don't
build or manage a transport — you pick a React track and install the matching
`react-server-loader`. The command above is all you need for stable.

To run the experimental train instead, install the three together; the
`react-server-loader` range collapses them to one copy, so no `overrides` are
needed:

```bash
npm install react@experimental react-dom@experimental react-server-loader@experimental
```

Experimental buys the newest RSC features ahead of stable — for instance it
already fixes the cosmetic `as="stylesheet"` CSS-preload warning that stable
React 19.2.x logs. See [React Compatibility](./docs/react-type-compatibility.md);
upgrading from 1.x, see the
[migration notes](./docs/getting-started.md#upgrading-from-1x).

## Minimal Example

File-based routes, server-computed props, and a one-call client entry. One
prerequisite: the project must be ESM (`"type": "module"` in `package.json`).

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { fileRouter } from "vite-plugin-react-server/router";

// Scans src/routes/** for page.tsx (+ sibling props.ts) and derives the
// route table and the prerender worklist.
const router = fileRouter("src/routes");

export default defineConfig({
  plugins: vitePluginReactServer({
    moduleBase: "src",
    Page: router.Page,
    props: router.props,
    routePatterns: router.routePatterns,
    build: { pages: router.build.pages },
  }),
});
```

```tsx
// src/routes/page.tsx — a server component, served at "/"
import { Link } from "vite-plugin-react-server/router/client";

export const Page = ({ title }: { title: string }) => (
  <main>
    <h1>{title}</h1>
    <Link to="/about">About</Link>
  </main>
);
```

```ts
// src/routes/props.ts — runs on the server; its result is the Page's props
export const props = () => ({ title: "Hello from the server" });
```

Add `src/routes/about/page.tsx` the same way and `/about` exists —
prerendered, and reachable client-side through `Link` without a page reload.
A sibling `props.ts` is optional: add one when the page needs
server-computed props.

```tsx
// src/client.tsx — the whole client entry: hydration + client-side navigation
"use client";
import { startClient } from "vite-plugin-react-server/router/client";

startClient({
  moduleBaseURL: import.meta.env.BASE_URL,
  publicOrigin: import.meta.env.PUBLIC_ORIGIN,
});
```

```html
<!-- index.html -->
<body>
  <div id="root"></div>
  <script type="module" src="/src/client.tsx"></script>
</body>
```

Routing is opt-in: skip `fileRouter` and map URLs to files yourself with
a `Page: (url) => string` mapping — see [Routing](./docs/routing.md).

```bash
# Dev server
npx vite

# Build (static site + server/client ESM)
npx vite build --app

# Same build, react-server main thread — optional: a bit faster, better stack traces
NODE_OPTIONS='--conditions react-server' vite build --app
```

## Build Output

```
dist/
├── static/          # Deployable to any static host
│   ├── index.html   # Pre-rendered HTML
│   └── index.rsc    # RSC payload for client navigation
├── client/          # Client-side ESM modules (for SSR)
└── server/          # Server-side ESM modules (with server actions)
```

`dist/static/` is a complete static site. `dist/client/` and `dist/server/` are ESM modules you can import in your own Express/Hono/Node server.

## Client components

A file is a client module when it starts with a `"use client"` directive — the
same rule as every other React setup. Nothing else marks one: the filename is
just a filename.

```tsx
// src/components/Counter.tsx
"use client";
import { useState } from "react";
export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

Leading whitespace, comments, and a `"use strict"` prologue may sit above the
directive; a `"use client"` placed after real code does not count.

Name a file `Counter.client.tsx` if you like the reminder — but the name carries
no meaning, and a file named that way *without* the directive gets a build
warning telling you to add one.

See [Getting Started](./docs/getting-started.md#the-client-filename-is-optional).

## Third-party client-component packages

Component libraries like Chakra UI, MUI, Mantine, react-aria, and framer-motion are **client-only** — their components rely on React context/state and must run inside a client boundary, the same constraint they carry under Next.js's App Router. Use them within a `"use client"` component (commonly a small provider wrapper); they can't be imported directly into a server component. This isn't a vprs limitation — e.g. [Chakra's own Next.js App Router guide](https://v2.chakra-ui.com/getting-started/nextjs-app-guide) requires wrapping `ChakraProvider` in a `'use client'` component.

vprs auto-detects these so they're treated correctly at build start: any package with `react` in its `peerDependencies` is classified as a client package (using [`vitefu.crawlFrameworkPkgs`](https://github.com/svitejs/vitefu)). Two escape hatches if needed:

```ts
vitePluginReactServer({
  // Force a package into the list (e.g. one that doesn't peerDep react)
  clientPackages: ["@my/internal-ui"],
  // Skip a detected one (e.g. devDeps Storybook bringing along @storybook/react)
  excludeClientPackages: ["@storybook/react", "@storybook/react-vite"],
});
```

## Storybook

vprs ships a Storybook preset — add one line and your RSC app's components build
and render in Storybook:

```ts
// .storybook/main.ts
export default {
  framework: { name: "@storybook/react-vite", options: {} },
  addons: ["vite-plugin-react-server/storybook"],
};
```

It strips the vprs plugin from Storybook's builder, resolves the
`react-server-dom-esm` transport (from `react-server-loader`), and silences
`"use client"`/`"use server"` directive noise. See
[Storybook](./docs/storybook.md) for details.

## Documentation

Everything below is also published as a browsable site at
**<a href="https://nicobrinkkemper.github.io/vite-plugin-react-server/" target="_blank" rel="noopener">nicobrinkkemper.github.io/vite-plugin-react-server</a>**,
which is itself built with vprs.

| Doc | What it covers |
|-----|---------------|
| [How vprs compares](./docs/comparison.md) | vprs vs `@vitejs/plugin-rsc`, Waku, Vike — and what vprs does not do |
| [Getting Started](./docs/getting-started.md) | Install → first page → dev server → build → deploy |
| [Routing](./docs/routing.md) | The file-based router: params, loaders, nested layouts, `Link` |
| [Storybook](./docs/storybook.md) | One-line Storybook support for vprs apps |
| [Build Output](./docs/build-output.md) | What the build produces, how to use the ESM modules |
| [Configuration](./docs/configuration.md) | All plugin options |
| [CSS Handling](./docs/css-handling.md) | Inline/linked CSS, CSS modules, the `Css` component |
| [Server Actions](./docs/server-actions.md) | `"use server"` directives, form actions, hosting |
| [Examples](./docs/examples.md) | Static site, dynamic server, server actions, custom routing |
| [Troubleshooting](./docs/troubleshooting.md) | Common errors and fixes |
| [API Reference](./docs/api-reference.md) | Exported functions, types, and components |

### Internals (contributors)

| Doc | What it covers |
|-----|---------------|
| [Architecture](./docs/internals/architecture.md) | Condition system, module structure, plugin composition |
| [Transformer](./docs/internals/transformer.md) | How `"use client"` / `"use server"` directives are processed |
| [Workers](./docs/internals/workers.md) | RSC and HTML worker threads |

### Maintenance

| Doc | What it covers |
|-----|---------------|
| [Releasing](./docs/releasing.md) | Version bumps, publishing, demo updates |
| [React Compatibility](./docs/react-type-compatibility.md) | Vendored ESM transport, type system |

## Requirements

- Node.js 22.0.0+ (the build uses `node:fs/promises#glob`, which landed in 22)
- **React 19.2+**, stable (`react` / `react-dom` at `^19.2.7`) or experimental.
  The RSC server APIs vprs uses (`prerenderToNodeStream`, the `react-server`
  transport exports) ship in stable React; the matching `react-server-dom-esm`
  transport comes from the `react-server-loader` dependency, which tracks your
  React track. See [React Compatibility](./docs/react-type-compatibility.md).
- **Vite 6, 7, or 8** (`vite` peer: `^6.3.5 || ^7 || ^8`). Vite 8 builds with
  Rolldown/Oxc instead of Rollup/esbuild; vprs runs on all three.

## TypeScript

```json
{
  "compilerOptions": {
    "types": ["vite/client", "vite-plugin-react-server/virtual"]
  }
}
```

## License

MIT
