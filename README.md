# vite-plugin-react-server

React Server Components for Vite. Run `vite build --app` and each prerendered
page gets an `index.html` and an `index.rsc`. Upload `dist/static/` to a static
host, and you have a site with client-side navigation. To render pages on
request, use the server modules from the same build.

Use the [file-based router](./docs/routing.md) for pages, nested layouts, and
loaders. If you already have a way to map URLs to components, use that.
vprs handles the component boundaries, rendering, and Vite builds either way.

The [documentation site](https://nicobrinkkemper.github.io/vite-plugin-react-server/)
is built with vprs.

## Quick start

To try it, clone the [starter](https://github.com/nicobrinkkemper/vprs-starter):

```bash
git clone https://github.com/nicobrinkkemper/vprs-starter my-app
cd my-app
npm install
npm run dev      # Start the Vite dev server
npm run build    # Build the static site and server modules
npm run preview  # Serve dist/static
npm run edge     # Render pages on request at :4401
```

Deploy `dist/static/` as-is for a static site. The starter also includes
`api/`, `vercel.json`, and `scripts/prepare-vercel.mjs` for rendering on
request with Vercel. If you don't need Vercel, change the `edge` script to
call `build` instead of `build:vercel`, then remove them.

## Install

To add vprs to your own project:

```bash
npm install -D vite-plugin-react-server react react-dom react-server-loader
```

You need Node.js 22+ and Vite `^6.3.5`, `^7`, or `^8`. Stable React is supported
with `react` and `react-dom` at `^19.2.8`, and `react-server-loader` at
`^19.2.20`. See [React versions](#react-versions) if you use experimental React.

## Minimal example

Set `"type": "module"` in `package.json`. Then add the plugin:

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";

export default defineConfig({
  plugins: vitePluginReactServer({
    runner: "isolated",
    moduleBase: "src",
    routes: { dir: "routes" },
  }),
});
```

vprs now looks for pages in `src/routes`. Put a `page.tsx` there to create `/`:

```tsx
// src/routes/page.tsx
import { Link } from "vite-plugin-react-server/router/client";

export const Page = ({ title }: { title: string }) => (
  <main>
    <h1>{title}</h1>
    <Link to="/about">About</Link>
  </main>
);
```

A sibling `props.ts` supplies the page's props from the server:

```ts
// src/routes/props.ts
export const props = () => ({ title: "Hello from the server" });
```

Add another page at `src/routes/about/page.tsx`:

```tsx
// src/routes/about/page.tsx
export const Page = () => <h1>About</h1>;
```

That's the second route. It will be prerendered too. A `props.ts` is optional;
this page has no props to compute.

The client entry hydrates the page and handles navigation:

```tsx
// src/client.tsx
"use client";
import { startClient } from "vite-plugin-react-server/router/client";

startClient({
  moduleBaseURL: import.meta.env.BASE_URL,
  publicOrigin: import.meta.env.PUBLIC_ORIGIN,
});
```

Load that entry from Vite's HTML template:

```html
<!-- index.html -->
<body>
  <div id="root"></div>
  <script type="module" src="/src/client.tsx"></script>
</body>
```

Now run the dev server or build the site:

```bash
npx vite
npx vite build --app
```

The build writes both pages to `dist/static/`. Opening a page loads its HTML.
Following the `About` link fetches `/about/index.rsc` and updates the page
without reloading the document.

To use your own routing, omit `routes` and supply a `Page: (url) => string`
mapping. See [Routing](./docs/routing.md) for that option, dynamic parameters,
layouts, and loaders.

## Client components

Add `"use client"` when a component needs client-side state or interaction:

```tsx
// src/components/Counter.tsx
"use client";
import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

The server can render this button with a count of `0`. The browser needs the
component's code to handle clicks and update that count. `"use client"` marks
that boundary, and hydration connects the click handler to the rendered button.

Put the directive before any executable code. Whitespace, comments, and
`"use strict"` may precede it. You can name the file `Counter.client.tsx` as
a reminder, but the filename doesn't create the boundary. Without the
directive, that filename produces a build warning.

See [Getting Started](./docs/getting-started.md#what-makes-it-a-client-component).

## Build output

The build produces these directories:

| Directory | Contents | Used by |
|---|---|---|
| `dist/static/` | Prerendered HTML, RSC payloads, browser JavaScript, and CSS | Your static host and the browser |
| `dist/client/` | Client components and their dependencies as Node-importable ESM | The HTML renderer |
| `dist/server/` | Server components, props, and server actions as ESM | The RSC renderer |
| `dist/server-edge/` | Bundled rendering code; enabled by default | A server or function rendering on request |

The name `dist/client/` can be confusing. It contains React client components
built for the HTML renderer, so it can render things like the counter above
on the server. The browser gets its JavaScript from `dist/static/`.

For a static site, upload only `dist/static/`. The server components have
already run during the build. If you need to render on request or call
server actions, you'll need a running server as well.

Use the built modules with your own HTTP server, such as Express or Hono,
or use the supplied request handlers. See [Build Output](./docs/build-output.md)
for the rendering pipeline and hosting examples.

## Choosing a runner

The example uses `runner: "isolated"` to run server components in a worker
thread. You can change where they execute with the `runner` option:

| Runner | Execution | Launch requirement |
|---|---|---|
| `"isolated"` | Server components run in a worker thread | Run without `--conditions react-server` |
| `"main"` | Server components run on the main thread | Launch Node with `--conditions react-server` |
| `"edge"` | Production rendering uses bundled server and client React in one isolate; development uses a worker thread | No `--conditions react-server` flag |

`"main"` lets you use React in `vite.config.ts` and gives more direct stack
traces. If you choose it, include the condition in each Vite script:

```json
{
  "scripts": {
    "dev": "NODE_OPTIONS='--conditions react-server' vite",
    "build": "NODE_OPTIONS='--conditions react-server' vite build --app",
    "preview": "NODE_OPTIONS='--conditions react-server' vite preview"
  }
}
```

vprs validates the runner against the launch flag when resolving the config.
`"main"` and `"isolated"` produce the same build output.

`"edge"` uses the webpack transport to bundle both rendering environments
without Node imports or module resolution at request time. That output can
run on Cloudflare Workers and Deno. See [Edge / Single-Isolate](./docs/edge.md)
for the runtime requirements and handlers.

## Third-party client-component packages

Libraries such as Chakra UI, MUI, Mantine, react-aria, and framer-motion use
`"use client"` directives in their compiled modules. vprs preserves these
boundaries so the server build creates client references. Executing those
modules as server components would fail when they call APIs such as
`createContext` or `useState`.

Two things can go wrong here:

- A server component refers to a package module that the client build never
  emitted. This causes `ERR_MODULE_NOT_FOUND` during rendering. Import the
  package from one of your own `"use client"` modules so the client build
  includes it.
- A provider takes configuration that can't cross the RSC boundary. Chakra's
  system object, for example, contains functions. Put the provider in a
  `"use client"` wrapper and create or import its configuration there.

A provider wrapper usually takes care of both. It imports the package into
the client build and keeps the configuration inside the client boundary.
Server components can then import the package's components directly. Chakra's
[App Router guide](https://chakra-ui.com/docs/get-started/frameworks/next-app)
includes such a wrapper.

vprs discovers packages with a React peer dependency using
[`vitefu.crawlFrameworkPkgs`](https://github.com/svitejs/vitefu). Adjust the
detected list when necessary:

```ts
vitePluginReactServer({
  runner: "isolated",
  // Include a package that doesn't declare React as a peer dependency.
  clientPackages: ["@my/internal-ui"],
  // Exclude packages used only by development tools.
  excludeClientPackages: ["@storybook/react", "@storybook/react-vite"],
});
```

## Storybook

Add the vprs preset to your Storybook configuration:

```ts
// .storybook/main.ts
export default {
  framework: { name: "@storybook/react-vite", options: {} },
  addons: ["vite-plugin-react-server/storybook"],
};
```

The preset removes the vprs plugin from Storybook's builder, resolves the
`react-server-dom-esm` transport through `react-server-loader`, and suppresses
directive warnings. See [Storybook](./docs/storybook.md) for details.

## TypeScript

Include the Vite and vprs virtual-module types in your TypeScript config:

```json
{
  "compilerOptions": {
    "types": ["vite/client", "vite-plugin-react-server/virtual"]
  }
}
```

## React versions

[`react-server-loader`](https://www.npmjs.com/package/react-server-loader)
contains the parts tied to a React version: the RSC transport, directive
processing, and Node loader. Install it alongside React so the server and
browser use compatible versions of the transport.

Experimental React is supported too. Use the matching snapshot for all three
packages. Check the plugin's peer dependencies before installing; the
`@experimental` tag can move beyond the supported snapshot.

```bash
npm view vite-plugin-react-server peerDependencies
npm install react@0.0.0-experimental-eb8feb71-20260814 react-dom@0.0.0-experimental-eb8feb71-20260814 react-server-loader@0.0.0-experimental-eb8feb71-20260814
```

See [React Compatibility](./docs/react-type-compatibility.md) for the
differences between stable and experimental, including the CSS preload
warning in stable React 19.2.x.

## Documentation

Read these pages on the
[documentation site](https://nicobrinkkemper.github.io/vite-plugin-react-server/)
or browse the Markdown files below.

| Doc | What it covers |
|-----|---------------|
| [How vprs compares](./docs/comparison.md) | Scope and trade-offs compared with [`@vitejs/plugin-rsc`](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-rsc), Waku, and Vike |
| [Getting Started](./docs/getting-started.md) | Installation, first page, development, build, and deployment |
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

## License

MIT
