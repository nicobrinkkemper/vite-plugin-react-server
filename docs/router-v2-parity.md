# Router v2 — Parity Spec & Conventions

Design doc for the next iteration of vprs's file-based router. The v1 foundation
(dynamic params, typed nav, edge/static/dev resolution) is in place; v2 makes the
router **on par with the alternatives** (TanStack Router/Start, Next.js app
router, Remix) and fixes the mixed-concern config surface v1 exposed.

**North star: the user declares routes once, and dev / static / edge / prefetch
all derive from that single table.** Minimize what the user has to think about.

---

## 1. What the foundation already has

- Dynamic `$param` segments and a `$` catch-all, with specificity ordering
  (literal > param > catch-all).
- Params typed from the pattern literal (`RouteParams<"/profile/$id">` →
  `{ id: string }`) — no codegen. Typed `<Link to>` / `navigate` via a `Register`
  merge.
- Loaders that receive `{ params, request }`, so an auth route gates by reading
  the request. Works on dev, static (SSG) and edge.
- Client nav: `<Link>`, `navigate`, `useParams` / `useLocation` / `useRouter`,
  prefetch-on-intent, per-url flight cache.
- SSR + streaming, flash-free hydration; a 404 route; `getStaticPaths`
  enumeration for prerendering concrete dynamic urls.

That is already most of a router. The gaps below are what "on par" requires.

---

## 2. Parity matrix

Legend: ✅ have · ⛏ v2 target · — n/a.

| Capability | TanStack | Next (app) | Remix | vprs now | vprs v2 |
|---|:--:|:--:|:--:|:--:|:--:|
| Dynamic params / catch-all | ✅ | ✅ | ✅ | ✅ | ✅ |
| Typed routes / params / links | ✅ | partial | partial | ✅ | ✅ |
| Data loader (params + request) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Client nav + prefetch | ✅ | ✅ | ✅ | ✅ | ✅ |
| SSR / streaming / RSC | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Nested layouts / `<Outlet/>`** | ✅ | ✅ | ✅ | — | ⛏ |
| **Per-layout (nested) loaders** | ✅ | ✅ | ✅ | — | ⛏ |
| **Index routes** | ✅ | ✅ | ✅ | — | ⛏ |
| **Pathless / grouping layouts** | ✅ | ✅ | ✅ | — | ⛏ |
| **Per-route error boundary** | ✅ | ✅ | ✅ | — | ⛏ |
| **Per-route pending / loading UI** | ✅ | ✅ | ✅ | — | ⛏ |
| **Per-route head / meta** | ✅ | ✅ | ✅ | partial | ⛏ |
| **Redirect / notFound from a loader** | ✅ | ✅ | ✅ | — | ⛏ |
| Search-param parsing/validation | ✅ | — | partial | — | (later) |
| Route context / `beforeLoad` middleware | ✅ | partial | partial | via loader | (later) |

The core new work is **nested layouts** (and everything that composes with them:
nested loaders, error/loading boundaries, index/pathless routes). The rest are
small, well-scoped additions.

---

## 3. File conventions

Modeled on TanStack Start / Next app router / Remix, mapped onto vprs's existing
shell (`Html` → `Root` → page). Scan root is `routes.dir`, resolved relative to
`moduleBase` (so `moduleBase: "src"` + `routes: { dir: "page" }` scans `src/page`).

```
src/page/
  __root.tsx        # the app shell (renders <Outlet/>); becomes vprs's Root
  route.tsx         # a LAYOUT for this segment + its children (renders <Outlet/>)
  page.tsx          # a LEAF route's UI                            [have]
  props.ts          # a route/layout loader: props(url, {params,request})  [have]
  index.tsx         # the exact-path leaf for a layout segment
  error.tsx         # error boundary for this segment + children
  loading.tsx       # Suspense fallback for this segment + children
  head.ts           # head/meta contribution for this segment
  $id/…             # dynamic param segment                        [have]
  $/…               # catch-all segment                            [have]
  (group)/…         # pathless group: shared layout, no URL segment
```

Mapping to vprs today:

| convention | vprs concept |
|---|---|
| `__root.tsx` | the `Root` shell component (renders `<Outlet/>`); `Html` stays the `<html>` document wrapper |
| `page.tsx` / `index.tsx` | leaf page component (have) |
| `props.ts` | loader (have) — now also valid beside a `route.tsx` layout |
| `route.tsx` | **new**: a layout server component that renders `{children}` |
| `error.tsx` / `loading.tsx` | **new**: client ErrorBoundary / Suspense boundary wrapping the segment |
| `head.ts` | **new**: head fragment merged into the document `<head>` |

The page/props filename patterns come from **`autoDiscover.pagePattern` /
`propsPattern`** (single source of truth) instead of `scanRoutes` re-hardcoding
`page.tsx` / `props.ts`.

---

## 4. How it maps to RSC (implementation notes)

**Nested layouts.** `scanRoutes` becomes a *tree* (parent/child), not a flat
pattern list. Resolving a matched url yields the *chain* from `__root` down
through each `route.tsx` layout to the leaf `page.tsx`:

```
<RootLayout>            // __root.tsx
  <SectionLayout>       // page/dashboard/route.tsx
    <SettingsPage/>     // page/dashboard/settings/page.tsx
  </SectionLayout>
</RootLayout>
```

Natural in RSC: each layout is a server component that renders `{children}`
(`<Outlet/>` is just `children`), and the flight streams the whole nested tree.
Each layout may have its own `props.ts`; the loaders for a matched chain resolve
in parallel and each layer gets its `{ params, request }`. Touches
`resolvePageAndProps` (resolve a chain + per-layer props) and
`createElementWithReact` (compose the chain instead of a single `Page`).

**Error boundaries** (`error.tsx`). A client component (`"use client"`) rendered
as an `ErrorBoundary` wrapping its segment's subtree in the composed chain. vprs
already streams; this is a wrapper insertion at compose time.

**Loading / pending** (`loading.tsx`). A `<Suspense fallback={Loading}>`
wrapping the segment, so a slow nested loader streams its fallback first.

**Head / meta** (`head.ts`). Each matched segment may contribute head tags;
merged and rendered in the document `<head>` via the `Html` wrapper (react-dom's
precedence-hoisted `<title>`/`<meta>`, same mechanism as the CSS `<Css>` path).

**Redirect / notFound from a loader.** The loader signals a redirect/notFound
(thrown sentinel or returned marker). The request handler translates it: on a
per-request render (dev/edge) → a 3xx / the 404 route; at prerender → skip the
page (or emit the 404 shell). Consumers still must not key urls on mutable data.

**Boundary of the render change.** All of this is *compose-time* — building a
nested element chain with wrappers — over machinery vprs already has (streaming
flight, client references, Suspense). No new transport or worker model.

---

## 5. Config surface (the `routes` field)

The v1 API made the user hand-copy `Page` / `props` / `routePatterns` /
`build.pages` into the plugin config. v2 collapses that into one field:

```js
vitePluginReactServer({
  moduleBase: "src",
  routes: { dir: "page" },            // the route table; the plugin fans it out
  build: { edge: { minify: false } }, // build.pages defaults from the router
})
```

- `routes` accepts a **file-router config** (`{ dir, staticPaths }`, the default
  and only mode today) **or** a custom router object (`{ Page, props,
  routePatterns, getStaticPaths }`) — a hand-rolled router is just that object.
- `resolveOptions` is the **fan-out point**: it prepends `moduleBase` to
  `routes.dir` and projects the table into the existing `Page` / `props` /
  `routePatterns` / `build.pages`, and threads it to dev / static / edge.
- **`build.pages` is demoted to the prerender worklist** (an output concern, not
  a routing one). It defaults to `router static-routes ∪ getStaticPaths`; its
  function form receives the router-derived list so you can filter/extend/replace
  without restating routes:
  `build: { pages: (routerPages) => [...routerPages, "/extra"] }`.
- Top-level `Page` / `props` / `routePatterns` remain as a low-level escape
  hatch (now expressed as a custom `routes` object) with a soft-deprecation nudge
  toward `routes`. `routePatterns` is unpublished, so it just moves.

Naming: **`routes`** (the route table) is preferred over `router` for the config
field, so `router` keeps meaning the client-nav runtime in `./router/client`.

---

## 6. Non-goals (for v2)

- **Search-param schema/validation** (TanStack's typed search) — useful but a
  separate surface; revisit after the tree lands.
- **Route context / `beforeLoad` middleware** — the loader-reads-request pattern
  covers auth today; a dedicated middleware layer is a later addition.
- **Mutation/action routing** — vprs has server actions as their own mechanism.
- Keying urls on mutable data (existing design boundary — unchanged).

---

## 7. Sequencing

1. **`routes` field + `resolveOptions` fan-out** — one field, `moduleBase`
   composition, projects into the existing pipeline. (Ships the current flat
   capability behind the final API.)
2. **Unify the page/props namespace** — `scanRoutes` reads `autoDiscover`
   patterns; kill the duplicate definition.
3. **`build.pages(routerPages)` transform** — output-side worklist override,
   resolved once in `resolveOptions`.
4. **Nested layouts + `<Outlet/>`** — the tree scan + chain composition + nested
   loaders. The core parity gap.
5. **Parity extras** — index routes, pathless groups, `error.tsx` / `loading.tsx`,
   `head.ts`, loader redirect/notFound.
6. **Migrate + deprecate** — example / mmc / bidoof / docs onto `routes`; soft
   deprecation of the loose `Page` / `props` / `routePatterns`.

Because a tree with no intermediate layouts *is* the flat case, the `routes`
field can be designed tree-shaped from step 1, and layouts (step 4) land
additively with no API churn.

Folded in along the way: the three low-priority review follow-ups (the
`.html`-vs-param normalize ambiguity, the unbounded client flight cache, the
per-request `routePatterns` array that defeats the matcher's sort cache) get
fixed as their surrounding code is reworked.

---

## 8. Resolved decisions (provisional — revisit if they bite)

- **`routes.dir` — explicit, short.** Require `routes: { dir: "page" }` (relative
  to `moduleBase`). Scopes routing to a subtree, stays predictable, and is one
  short string. A zero-config `routes: true` (scan all of `moduleBase`) can be
  added later if demand appears, but scanning every `page.*` under `src`
  risks picking up non-route pages.
- **Head/meta — `head.ts` export.** A `head.ts` beside the route exports
  `title`/`meta`, receiving `{ params, data }` so meta can derive from loader
  data, and merging up the matched chain. Matches the loader model and fits RSC
  (meta usually comes from data, not markup). A `<Head>` component can coexist
  later, but the export is the primary convention.
- **`error.tsx` — per-segment + root default.** `error.tsx` at any segment wraps
  that subtree; a root-level `error.tsx` catches anything otherwise uncaught
  (full Next/Remix parity). Falls through to vprs's existing error handling if no
  boundary matches.
