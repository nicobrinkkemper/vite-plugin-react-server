# Troubleshooting

## React Version Mismatch

**Symptoms:** Type errors, "rules of hooks" during builds, `Root cannot be used as a JSX component`.

**Fix:** Ensure all React packages match:

```json
{
  "react": "^19.2.8",
  "react-dom": "^19.2.8",
  "@types/react": "^19.0.9",
  "@types/react-dom": "^19.0.3"
}
```

## Missing Stack Traces

Open the browser DevTools console (F12). The plugin streams detailed errors there, not to the rendered page.

## `react-server-dom-esm` Resolution Errors

The transport ships inside the `react-server-loader` peer dependency
(installed alongside `react` / `react-dom`), so there is no separate
transport package to install. The plugin resolves bare
`react-server-dom-esm/*` imports for you. For scripts outside Vite:

```bash
node --import vite-plugin-react-server/register ./your-script.mjs
```

If resolution still fails, confirm `react-server-loader` is installed
(`npm ls react-server-loader`) and that `react` / `react-dom` satisfy its peer
(`^19.2.8`).

## `"use client"` Not Working

The directive is the only thing that makes a client module, and it must come
before any real code. Leading whitespace, comments, and a `"use strict"` prologue
are tolerated above it.

If the build warns that a file *looks* like a client module but has no directive,
that is this: the filename does not mark a component, so add `"use client"` to
the top of the file.

Import with the `.js` extension regardless: `import { Counter } from "./Counter.js"`.

## Global CSS / Fonts Not Loading

If your client-entry's CSS imports (global stylesheet, font CSS) aren't reaching the page, check that `index.html` has a `<script type="module" src="...">` for the entry, e.g.:

```html
<script type="module" src="/src/client.tsx"></script>
```

You do **not** need to set `clientEntry` for the conventional case — vprs leaves index.html-referenced entries to Vite's own discovery so it can pick up their CSS through the normal Vite manifest.

## `as="stylesheet"` Preload Warnings (Stable React)

**Symptoms:** Console floods with `<link rel=preload> uses an unsupported 'as' value` / "preload ignored" warnings; the offending tag is `<link rel="preload" as="stylesheet">`.

**This is a stable-React bug, not a config problem — and it's cosmetic.** React 19.2.x stable's Flight server emits CSS preload hints with `as="stylesheet"` (`ReactFlightServerConfigDOM.processLink()`); the only valid preload token is `style`, so browsers reject the hint and warn. The real `<link rel="stylesheet">` is emitted separately and works — styling is unaffected. The fix already exists upstream on React `main` and reaches you when the next stable React lands (this plugin re-vendors its transport per stable release).

**If you want the warnings gone now**, move to the experimental channel — `react-server-loader` publishes an experimental train vendoring React `main`'s transport, with peers pinned to the exact matching React:

```bash
npm view react-server-loader dist-tags   # find the current experimental version
npm install react-server-loader@experimental \
  react@<its exact react peer> react-dom@<same>
```

Keep every transitive dependency on that same React with npm overrides:

```json
{
  "overrides": {
    "react": "$react",
    "react-dom": "$react-dom"
  }
}
```

`$react` means "the version my own dependencies declare", so all deps dedupe onto your React. Mixing channels (experimental transport on stable React, or vice versa) crashes on internals skew — the exact peer pin exists to stop that.

## Static Snapshot Hydration Throws #418 on `<title>` (Stable React)

**Symptoms:** Every cold load of a prerendered (frozen) page logs `Minified React error #418` with args `text,` — and afterwards the document has **two** `<title>` elements. The same page served per-request (dev, `npm run edge`, a server) hydrates clean.

**This is a stable-React hydration bug against frozen snapshots, and it's cosmetic.** React 19.2.x stable fails to adopt the snapshot's hoistable `<title>` during hydration: it reports the mismatch and inserts its own title next to the server one. The page still hydrates and islands work. Removing the `<title>` removes the error, but the right fix is the experimental channel — the adoption bug is already fixed there (same install recipe as the preload section above). Verified against 3.4.6 snapshots: stable errors on every load, the experimental train is clean.

## Mojibake on Static Hosts (Missing `charset`)

**Symptoms:** On some static hosts, non-ASCII text in a prerendered page (`…`, `—`, curly quotes) renders as `â€¦`-style garbage. The same build looks fine on GH Pages or Vercel.

A snapshot contains exactly the head your app renders — nothing injects a charset for you. When the file server also omits `charset=utf-8` from `Content-Type` (GH Pages and Vercel send it; bare servers often don't), the browser falls back to Latin-1. Declare it in the app:

```tsx
<meta charSet="utf-8" />
```

React hoists it to first-in-head with charset precedence, so the snapshot is self-describing on any host.

## `"use server"` Not Working

- File-level: must be first line
- Function-level: must be first statement in function body
- Server actions need a request handler — any Node server, or the baked edge
  bundle's sealed gate (`handleRouteAction`, a Web-standard
  `(Request) => Response`) on node-free runtimes. A purely static host has no
  handler to execute them.

## Sourcemap Warning (Transformer Plugin)

```
src/components/Link.client.tsx (1:0): Error when using sourcemap...
```

Non-critical. The transformer removes directives and the sourcemap points to the removed line. End result is correct.

## Environment API Only Builds One Environment

Use `createBuilder()` instead of `build()`:

```ts
import { createBuilder } from "vite";
const builder = await createBuilder(config);
await builder.buildApp();
```

## CORS Errors During Preview

Access via `localhost:4173`, not `127.0.0.1:4173`. Or set `publicOrigin` explicitly:

```ts
publicOrigin: "http://localhost:4173",
```

## Worker Timeouts

Increase timeout values:

```ts
rscTimeout: 10000,
htmlTimeout: 30000,
htmlWorkerStartupTimeout: 10000,
rscWorkerStartupTimeout: 10000,
```

## Performance Script in HTML Output

If you see `<script>requestAnimationFrame(function(){$RT=performance.now()});</script>` unexpectedly, you're calling `pipe()` late. Call it immediately after `renderToPipeableStream`:

```ts
const { pipe } = ReactDOMServer.renderToPipeableStream(element);
pipe(passThrough); // Call immediately — not in onShellReady
```

## Stream Timeouts (3 seconds)

The plugin uses only the worker timeout. If operations complete in 5-30ms but timeout at 3s, you may be on an older version. Update the plugin.

## Import Extensions

Always use `.js` extensions in imports, even for TypeScript files:

```ts
import { Page } from "./page.js";       // ✅
import { Page } from "./page.tsx";      // ❌
import { Page } from "./page";          // ❌
```

## Debug Build

```json
{
  "scripts": {
    "debug-build": "NODE_ENV=development npm run build -- --mode development"
  }
}
```

This shows full error messages instead of "this error message is hidden in production".

## Verbose Logging

```ts
vitePluginReactServer({
  verbose: true,
  onEvent: (event) => console.log("Event:", event),
  onMetrics: (metrics) => console.log("Metrics:", metrics),
});
```

## Variable Dynamic Imports on Vite 8 (Rolldown)

A *variable* dynamic import in a server module — ``import(`./pages/${name}.js`)``
where the specifier is built from a variable — fails to build on Vite 8. The
plugin's server bundle uses `preserveModules`, and Rolldown does not emit its
dynamic-import helper module in that mode, so the build can't resolve it:

```
Failed to load url ../_virtual/_rolldown_dynamic_import_helper.js
Component resolution failed: missing required components (Page: false)
```

This is an upstream Rolldown limitation, not vprs-specific. Workarounds:

- Replace the variable import with a static map (`{ light: () => import("./light.js"), … }[name]()`), or
- Build that route on **Vite 6 or 7** (Rollup), which emit the helper.

## Checklist for New Projects

- [ ] React packages have matching versions (19.2+)
- [ ] Client components have `"use client"` directive
- [ ] Server actions have `"use server"` directive
- [ ] Imports use `.js` extensions
- [ ] CSS files imported in components (not standalone)
- [ ] `tsconfig.json` includes `"vite-plugin-react-server/virtual"` in types
