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

```bash
npm run dev      # dev server
npm run build    # dist/static + dist/client + dist/server-edge
npm run edge     # serve the build; open http://localhost:8788
```

`useParams()` / `useLocation()` are **client-only** — they require the
`RouterProvider` that `startClient` adds at hydration, so don't call them in a
component that renders during SSR/prerender. Read params from the loader
(`props`) for anything that must appear in server-rendered HTML.
