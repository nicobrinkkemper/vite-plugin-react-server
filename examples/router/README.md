# File router example

Shows the built-in file router end to end:

- **File-based routes** — `src/routes/**/page.tsx` (+ sibling `props.ts`).
  `/` is static; `/greet/$name` is dynamic (typed `params`).
- **Params into the loader** — `props(url, { params, request })`; `name` is read
  server-side so it's in the prerendered HTML.
- **Client router** — `startClient({ patterns })` in `src/client.tsx` is the
  whole client entry (router + `RouterProvider` + hydration + HMR). `<Link>`
  navigates client-side with no full reload.
- **getStaticPaths** — prerenders `/greet/ada` and `/greet/grace`; any other
  `/greet/<name>` renders live per request on the edge.
- **Index routes** — `src/routes/about/index.tsx` is a leaf route
  (`page.tsx` wins when both exist; `index.ts` barrels are never routes).
- **Pathless groups** — `(legacy)/old` serves `/old`: a `(group)` directory
  organizes files (and can hold a shared `route.tsx`/`error.tsx`) without
  adding a URL segment.
- **head.ts** — per-segment title/meta merged root→leaf (leaf title wins).
  A function export receives `{ url, params, data }`, so
  `greet/$name/head.ts` derives `Greeting <name>` from the loader data. The
  tags render as react-dom hoistables and land in `<head>` on every path.
- **error.tsx** — a `"use client"` boundary for the segment's subtree:
  `export const ErrorBoundary = createErrorBoundary(({ error, reset }) => …)`.
- **loading.tsx** — `export const Loading = () => …` becomes the segment's
  Suspense fallback while a nested loader streams.
- **redirect / notFound** — a loader throws `redirect("/greet/ada")` (see
  `(legacy)/old/props.ts`) or `notFound()`. Per-request paths answer with
  the 3xx/404; the static prerender skips the page with a warning, so don't
  enumerate redirecting routes in `getStaticPaths`.

```bash
npm run dev      # dev server
npm run build    # dist/static + dist/client + dist/server-edge
npm run edge     # serve the build; open http://localhost:8788
```

`useParams()` / `useLocation()` are **client-only** — they require the
`RouterProvider` that `startClient` adds at hydration, so don't call them in a
component that renders during SSR/prerender. Read params from the loader
(`props`) for anything that must appear in server-rendered HTML.
