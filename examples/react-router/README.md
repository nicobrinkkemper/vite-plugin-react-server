# React Router on vite-plugin-react-server

A third-party router composes with vprs: React Router owns client-side
navigation inside a `"use client"` boundary, while vprs owns the RSC render,
the server props, and the prerender.

## The composition

- `src/page.tsx` is a server component. Every URL maps to it (`Page: () =>
  "src/page.tsx"`), because the router reads the location itself.
- `src/AppRouter.client.tsx` is the client boundary: `BrowserRouter` in the
  browser, `MemoryRouter` seeded from the server-provided path during
  prerender — so each entry in `build.pages` emits real HTML for its matching
  Router view, and hydration lands on the same markup. (Data mode's
  `createBrowserRouter` composes the same way; its loaders initialize
  asynchronously, so a data-mode prerender wants `hydrationData`.)
- Server props (`src/props.ts`) cross the boundary once; every client-side
  navigation reads from them. No `/index.rsc` round-trip per navigation —
  navigation is entirely React Router's.

## The trade

Views under the Router live in the client bundle. Server components can feed
them (props at the boundary) but not render per-navigation — that is what the
built-in vprs router does instead (`examples/router`). Pick per app.

## Run

```sh
npm install
npm run dev       # dev server; deep links work (/about, /users/grace, …)
npm run build     # prerenders /, /about, /users/ada
npm run preview
```
