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

Under `routes.dir`, a directory's path **is** its URL. These filenames are
meaningful:

| file | role |
| --- | --- |
| `page.tsx` | the page rendered at this URL |
| `index.tsx` | alternate name for the page (`page.tsx` wins when both exist) |
| `props.ts` | this segment's **loader** — its return value is the page's props |
| `route.tsx` | a **layout** wrapping this segment's page and every descendant |
| `error.tsx` | a client **error boundary** for this segment and every descendant |
| `loading.tsx` | a **Suspense fallback** for this segment and every descendant |
| `head.ts` | this segment's **head/meta contribution**, merged root→leaf |

A directory named `$name` is a **dynamic param**. A directory named just `$` is a
**catch-all**. A directory named `(group)` is **pathless**: it organizes files
(and can hold a shared `route.tsx` / `error.tsx`) without adding a URL segment —
two pages collapsing onto one URL is a scan-time error, not a silent override.

`index.tsx` is matched as jsx/tsx only, deliberately: `index.ts` is the
conventional barrel filename, and a re-export barrel inside the routes tree must
never become a route.

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

Within one segment the wrap order is `Layout → ErrorBoundary →
Suspense(Loading) → children` — a segment's boundary catches its children, not
its own layout. None of these files requires the others; a segment can
contribute just a `loading.tsx` or just a `head.ts`.

## Error and loading boundaries

`error.tsx` is a `"use client"` module exporting the boundary. Wrap a fallback
with `createErrorBoundary` and it catches render errors in the segment's
subtree — including errors a server component threw into the flight stream:

```tsx
// src/routes/error.tsx
"use client";
import { createErrorBoundary } from "vite-plugin-react-server/router/client";

export const ErrorBoundary = createErrorBoundary(({ error, reset }) => (
  <div role="alert">
    <p>{error.message}</p>
    <button onClick={reset}>Retry</button>
  </div>
));
```

`loading.tsx` exports `Loading` — the Suspense fallback shown while a nested
loader streams:

```tsx
// src/routes/greet/$name/loading.tsx
export const Loading = () => <p>Loading greeting…</p>;
```

## Per-route head and meta

`head.ts` exports `head`: a static object, or a function receiving
`{ url, params, data }` where `data` is the segment's resolved loader result.
Contributions merge root→leaf — the deepest title wins, and a meta entry keyed
by `name`/`property` overrides an ancestor's same-key entry:

```ts
// src/routes/head.ts
export const head = {
  title: "My site",
  meta: [{ name: "description", content: "…" }],
};

// src/routes/greet/$name/head.ts
import type { RouteHeadExport } from "vite-plugin-react-server/router";
export const head: RouteHeadExport = ({ data }) => ({
  title: `Greeting ${data.name}`,
});
```

The merged contribution is delivered per surface: document renders (static
prerender, the edge document) emit real `<title>`/`<meta>`/`<link>` tags into
the page `<head>` for crawlers, while the hydration/navigation flight carries
the same data inertly and the client router applies `title` and keyed `meta`
after hydration and on every navigation. (Raw head tags deliberately don't
ride the flight: React re-inserts instead of adopting them when hydration
suspends on a client component, duplicating tags and throwing hydration
error #418.) `links` and unkeyed meta are document-only.

## Redirect and notFound from a loader

A loader ends the render early by throwing:

```ts
// src/routes/old/props.ts
import { redirect } from "vite-plugin-react-server/router";
export const props = () => redirect("/new-home");        // 302 by default

// or, for a gated route:
import { notFound } from "vite-plugin-react-server/router";
export const props = (_url, { request }) => {
  if (!isAuthorized(request)) throw notFound();
  return loadSecrets();
};
```

Per-request renders (dev, Node, edge) answer with the 3xx or a 404; client
navigation follows the redirect transparently and the router fixes the address
bar. The static prerender can't answer a redirect, so it **skips the page with
a warning** — don't enumerate redirecting routes in `staticPaths`.

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
