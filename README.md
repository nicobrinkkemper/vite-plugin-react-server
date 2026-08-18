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

## Quick start

The fastest path is the
[starter](https://github.com/nicobrinkkemper/vprs-starter): a minimal app
(file-based routes, one-call client entry, an interactive hero) whose single
`vite build --app` serves a static CDN, a local per-request server, and Vercel.

```bash
git clone https://github.com/nicobrinkkemper/vprs-starter my-app
cd my-app && npm install
npm run dev      # vite dev server
npm run build    # → dist/static (+ dist/client, dist/server, dist/server-edge)
npm run preview  # serve the prerendered dist/static
npm run edge     # render every route per request on :4401
```

`dist/static/` deploys to any static host as-is. The checked-in `api/`,
`vercel.json`, and `scripts/prepare-vercel.mjs` ship the same build to Vercel
with per-request routes; all three are deletable if you don't need Vercel
(retarget the `edge` script from `build:vercel` to plain `build` first).

## Install

Starting from scratch instead:

```bash
npm install -D vite-plugin-react-server react react-dom react-server-loader
```

vprs runs on **stable React 19.2+** out of the box, and on experimental React
too. Everything locked to a React version (the RSC transport on both the server
and your browser bundle, the directive engine, the Node loader) lives in the
[`react-server-loader`](https://www.npmjs.com/package/react-server-loader)
peer dependency, whose versions track React the way `@types/react` does. Pick a
React track, install the matching `react-server-loader` alongside `react` and
`react-dom` — one copy in your tree, no `overrides` needed. For the
experimental train (which the starter pins), install the three together:

```bash
npm install react@experimental react-dom@experimental react-server-loader@experimental
```

Experimental buys the newest RSC features ahead of stable, for instance the fix
for the cosmetic `as="stylesheet"` CSS-preload warning that stable React 19.2.x
logs. See [React Compatibility](./docs/react-type-compatibility.md).

## Minimal Example

The same wiring the starter deploys, built up from scratch: file-based routes,
server-computed props, and a one-call client entry. One prerequisite: the
project must be ESM (`"type": "module"` in `package.json`).

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";

export default defineConfig({
  plugins: vitePluginReactServer({
    moduleBase: "src",
    // Scans src/routes/** for page.tsx (+ sibling props.ts) and derives the
    // route table and the prerender worklist.
    routes: { dir: "routes" },
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

Routing is opt-in: skip `routes` and map URLs to files yourself with
a `Page: (url) => string` mapping — see [Routing](./docs/routing.md).

```bash
npx vite              # dev server
npx vite build --app  # build: static site + server/client ESM

# Optional react-server main thread: a bit faster, better stack traces
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

See [Getting Started](./docs/getting-started.md#what-makes-it-a-client-component).

## Third-party client-component packages

Component libraries like Chakra UI, MUI, Mantine, react-aria, and framer-motion ship per-file `"use client"` directives in their compiled output. vprs detects these packages and preserves the directives, so the server build turns each directive module into a client reference instead of executing it under the `react-server` condition (which would throw on `createContext`/`useState`).

Two rules govern using them:

- **The package must be reachable from the client graph.** The client build only emits (hosts) package modules that some first-party `"use client"` module imports; a client reference recorded by the server build dangles at render time (`ERR_MODULE_NOT_FOUND`) if nothing client-side pulls the package in. With such an importer in place, server components can import the package's components directly.
- **Providers need a `"use client"` wrapper.** Props crossing the server→client boundary must be serializable, and a provider's value typically isn't (`ChakraProvider` takes a system object full of functions). This is an RSC constraint, not a vprs one: [Chakra's App Router guide](https://chakra-ui.com/docs/get-started/frameworks/next-app) ships that wrapper as its CLI-generated `provider.tsx` snippet.

In practice the provider wrapper satisfies both rules at once: it is the client-side importer that gets the package hosted.

Detection is automatic at build start: any package with `react` in its `peerDependencies` is classified as a client package (using [`vitefu.crawlFrameworkPkgs`](https://github.com/svitejs/vitefu)). Two escape hatches if needed:

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
