# vite-plugin-react-server

React Server Components for plain Vite on **stable React** — no framework, no
experimental builds. One `vite build --app` prerenders your pages to static
HTML + RSC payloads and emits your components as portable ESM that runs under
any HTTP server: static hosting, Express/Hono, or anything in between.

It works in BOTH Node module conditions, by design: the dev server and the
build run with or without `--conditions react-server`, and whichever side your
main thread is on, a worker thread mirrors the other half (server components
need a react-server context, client hydration needs a react-client one — you
always have both). Running the main thread under react-server is an optional
optimization — slightly faster, better stack traces — never a requirement.

**Where this sits:** vprs is a low-level *plugin*, not a framework, so it
imposes no router or app structure. Its closest peer is the official
[`@vitejs/plugin-rsc`](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-rsc);
vprs differs by using the ESM transport (`react-server-dom-esm`) and emitting
portable ESM you host yourself. If you'd rather a framework decide for you, look
at Waku or Vike. Full breakdown, including what vprs does **not** do:
[How vprs compares](./docs/comparison.md).

## Install

```bash
npm install -D vite-plugin-react-server react react-dom
```

vprs runs on **stable React 19.2+** out of the box. Everything
React-version-locked — the `react-server-dom-esm` transport (server side AND
the flight client your browser bundle ships), the directive engine, the Node
loader — lives in the
[`react-server-loader`](https://www.npmjs.com/package/react-server-loader)
dependency, installed for you (every package manager). The command above is all
you need.

**Want correct CSS preloading?** Stable React 19.2.x emits its CSS preload hint
as an invalid `as="stylesheet"`, so browsers ignore the preload (styles still
load, just not preloaded) and log a warning. The fix is on React's experimental
channel today (and reaches stable when React ships it). To opt in, install the
experimental train — all three pinned together:

```bash
npm install react@experimental react-dom@experimental react-server-loader@experimental
```

That's the whole step: `react-server-loader`'s range admits both trains, so npm
collapses to a single experimental copy — no `overrides`, no duplicate. See
[React Compatibility](./docs/react-type-compatibility.md). Upgrading from 1.x?
See the [migration notes](./docs/getting-started.md#upgrading-from-1x).

## Minimal Example

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";

export default defineConfig({
  plugins: vitePluginReactServer({
    moduleBase: "src",
    Page: "src/page.tsx",
    build: { pages: ["/"] },
  }),
});
```

```tsx
// src/page.tsx
export const Page = ({ url }: { url: string }) => <div>Hello from {url}</div>;
```

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

vprs recognises a file as a client module when **either** of these is true:

- the filename matches `(^|[\/.])client\.[cm]?[jt]sx?$` — i.e. `Button.client.tsx`, `bar.client.mjs`, or the standalone basename `src/client.tsx` / `client.tsx`, or
- the file starts with a top-of-file `"use client"` directive (leading whitespace, line/block comments, and an optional `"use strict"` prologue are tolerated above it).

Either is sufficient. Substrings like `clientUtils.tsx`, `clientId.ts`, or `clients.tsx` are **not** treated as client modules, and a `"use client"` directive placed after real code does not count.

```tsx
// src/components/Counter.tsx  ← no `.client.` suffix needed
"use client";
import { useState } from "react";
export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

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
[Storybook](./docs/storybook.md) for details. (Requires vprs ≥ 1.9.0.)

## Documentation

| Doc | What it covers |
|-----|---------------|
| [How vprs compares](./docs/comparison.md) | vprs vs `@vitejs/plugin-rsc`, Waku, Vike — and what vprs does not do |
| [Getting Started](./docs/getting-started.md) | Install → first page → dev server → build → deploy |
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
- **Stable React 19.2+** (`react` / `react-dom` at `^19.2.7`). As of 2.0 the RSC
  server APIs vprs relies on (`prerenderToNodeStream`, the `react-server`
  transport exports) are part of stable React, so no experimental build is
  required. The matching `react-server-dom-esm` transport is provided by the
  `react-server-loader` peer; experimental React still works if you want
  the newest RSC features. See [React Compatibility](./docs/react-type-compatibility.md).
- Vite 6+

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
