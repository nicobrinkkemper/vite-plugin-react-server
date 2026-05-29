# vite-plugin-react-server

A Vite plugin that transforms React components into native ESM modules with React Server Components support. Build static sites, dynamic servers, or anything in between — your components become portable ESM that works with any HTTP server.

## Install

```bash
npm install -D vite-plugin-react-server react@experimental react-dom@experimental
```

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

# Build
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

Mark a client component with a top-of-file `"use client"` directive. The
`.client.` filename suffix is **optional** — a first-party module that starts
with `"use client"` is detected, hosted, and emitted as a client chunk in the
static (`--app`) build, so you can import it directly into a server component:

```tsx
// src/components/Counter.tsx  ← no `.client.` suffix needed
"use client";
import { useState } from "react";
export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

Detection is by directive position (top of file, the same rule React enforces),
not by a substring match. The `.client.` convention still works as a visual
marker. See [Getting Started](./docs/getting-started.md#the-client-filename-is-optional).

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

It strips the vprs plugin from Storybook's builder, resolves the vendored
`react-server-dom-esm`, and silences `"use client"`/`"use server"` directive
noise. See [Storybook](./docs/storybook.md) for details. (Requires vprs ≥ 1.9.0.)

## Documentation

| Doc | What it covers |
|-----|---------------|
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

- Node.js 23.7.0+
- React experimental channel (`react@experimental` / `react-dom@experimental`). Stable React 19.x is **not yet supported** — the vendored `react-server-dom-esm` reads `TaintRegistryPendingRequests` from React's server internals, and the taint registry is only exposed on the experimental channel today. See [React Compatibility](./docs/react-type-compatibility.md) for the full story; stable support is tracked separately and is gated on upstream React landing the taint API in the stable build.
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
