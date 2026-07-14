# Routing

vprs ships a file-based router: point it at a directory, and the file tree *is*
the URL tree. Dynamic params, per-segment loaders, nested layouts, prerendering,
and client-side navigation all come from that one convention.

It is opt-in. Without `routes`, the plugin does not own routing at all — see
[Bring your own](#bring-your-own) at the bottom.

## Turn it on

```ts
// vite.config.ts
vitePluginReactServer({
  moduleBase: "src",
  routes: { dir: "routes" },   // scans src/routes/**
})
```

That single field derives the page for every URL, each route's loader, the route
patterns, and the prerender worklist. There is nothing to register and no
codegen step.

## The convention

Under `routes.dir`, a directory's path **is** its URL. Three filenames are
meaningful:

| file | role |
| --- | --- |
| `page.tsx` | the page rendered at this URL |
| `props.ts` | this segment's **loader** — its return value is the page's props |
| `route.tsx` | a **layout** wrapping this segment's page and every descendant |

A directory named `$name` is a **dynamic param**. A directory named just `$` is a
**catch-all**.

```
src/routes/
├── route.tsx              layout for every page
├── props.ts               loader for /
├── page.tsx               /
└── greet/
    ├── route.tsx          layout for /greet/*  (nests inside the root layout)
    ├── props.ts           loader for the /greet segment
    └── $name/
        ├── props.ts       loader for /greet/$name
        └── page.tsx       /greet/ada, /greet/grace, /greet/anyone
```

## Params reach the loader

A loader is `props(url, { params, request })`. Params are threaded in for you and
typed from the pattern:

```ts
// src/routes/greet/$name/props.ts
export const props = (_url: string, { params }: { params: { name: string } }) => ({
  name: params.name,
});
```

The page then receives that return value as its props. In a client component,
read them with `useParams()`.

## Layouts nest, and each has its own loader

A `route.tsx` exports `Layout`. It wraps its segment's page *and* everything
below it, and it is fed by **its own** `props.ts` — not the page's.

```tsx
// src/routes/greet/route.tsx
export const Layout = ({ section, children }: { section?: string; children?: React.ReactNode }) => (
  <section>
    <p>{section}</p>
    {children}
  </section>
);
```

So `/greet/ada` composes as **root layout › greet layout › page**, each layer
with its own props. That is the whole nesting model.

## Static, dynamic, or both

A route with a `$` param can't be enumerated, so say which instances to
prerender:

```ts
routes: {
  dir: "routes",
  staticPaths: {
    "/greet/$name": () => [{ name: "ada" }, { name: "grace" }],
  },
}
```

`/greet/ada` and `/greet/grace` are prerendered into the static build. Any *other*
name still renders live per request on a server or at the edge — the same route,
resolved at request time. You choose per route; you don't choose per app.

## Client-side navigation

One line wires the router, hydration and HMR:

```tsx
// src/client.tsx
"use client";
import { startClient } from "vite-plugin-react-server/router/client";

startClient({ patterns: ["/", "/greet/$name"] });
```

`patterns` is what lets `useParams()` resolve for the current URL.

Then navigate with `Link`, which intercepts internal clicks and fetches the next
route's flight instead of reloading the page:

```tsx
"use client";
import { Link } from "vite-plugin-react-server/router/client";

export function Nav() {
  return (
    <nav>
      <Link to="/">Home</Link>
      <Link to="/greet/ada">Ada</Link>
    </nav>
  );
}
```

Also exported from `vite-plugin-react-server/router/client`: `useParams`,
`useLocation`, `useRouter`, `RouterProvider`, and `createRouter` if you want to
assemble it yourself instead of using `startClient`.

## Typed routes (optional)

Augment `Register` with your route union to get autocomplete and checking on
`Link`'s `to` — the TanStack-style pattern, no codegen:

```ts
declare module "vite-plugin-react-server/router/client" {
  interface Register {
    routes: "/" | "/greet/$name";
  }
}
```

Concrete paths like `/greet/alice` still type-check; the *patterns* are what
autocomplete. Skip this and route paths are plain `string`.

## Bring your own

The router is a knob, not a requirement. Drop `routes` and map URLs to files
yourself:

```ts
Page: (url) => `src/pages${url}page.tsx`,
```

…and use React Router, TanStack Router, or nothing at all. The plugin renders
whatever page you point it at.

## See also

- [`examples/router`](../examples/router) — the source every snippet above is taken from
- [Edge / Single-Isolate](./edge.md) — serving dynamic routes from one `fetch` handler
