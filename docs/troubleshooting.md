# Troubleshooting

## React Version Mismatch

**Symptoms:** Type errors, "rules of hooks" during builds, `Root cannot be used as a JSX component`.

**Fix:** Ensure all React packages match:

```json
{
  "react": "^19.0.0",
  "react-dom": "^19.0.0",
  "@types/react": "^19.0.9",
  "@types/react-dom": "^19.0.3"
}
```

## Missing Stack Traces

Open the browser DevTools console (F12). The plugin streams detailed errors there, not to the rendered page.

## `react-server-dom-esm` Resolution Errors

The transport ships inside the `react-server-loader` dependency (a normal
install), so no separate transport install is needed. The plugin resolves bare
`react-server-dom-esm/*` imports for you. For scripts outside Vite:

```bash
node --import vite-plugin-react-server/register ./your-script.mjs
```

If resolution still fails, confirm `react-server-loader` is installed
(`npm ls react-server-loader`) and that `react` / `react-dom` satisfy its peer
(`^19.2.7`).

## `"use client"` Not Working

vprs treats a file as a client module when either of these is true:

- the filename matches `(^|[\/.])client\.[cm]?[jt]sx?$` (e.g. `Counter.client.tsx`, or the standalone basename `src/client.tsx`), or
- the file starts with a top-of-file `"use client"` directive — leading whitespace, comments, and an optional `"use strict"` prologue are tolerated above it, but the directive must come before any real code.

Substrings like `clientUtils.tsx` or `clientId.ts` are **not** matched. Import with `.js` extension regardless: `import { Counter } from "./Counter.js"`.

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

## `"use server"` Not Working

- File-level: must be first line
- Function-level: must be first statement in function body
- Server actions only work with a Node.js server, not static hosting

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

## Checklist for New Projects

- [ ] React packages have matching versions (19+)
- [ ] Client components have `"use client"` directive
- [ ] Server actions have `"use server"` directive
- [ ] Imports use `.js` extensions
- [ ] CSS files imported in components (not standalone)
- [ ] `tsconfig.json` includes `"vite-plugin-react-server/virtual"` in types
