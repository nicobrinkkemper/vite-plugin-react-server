# Architecture

> This document is for contributors and curious developers. You don't need this to use the plugin.

## Condition System

The plugin uses Node.js [package conditions](https://nodejs.org/api/packages.html#conditional-exports) to load different implementations based on the execution environment.

| Condition | Loaded modules | Purpose |
|-----------|---------------|---------|
| `react-server` | `*.server.ts` | RSC rendering, server actions |
| (default) | `*.client.ts` | HTML rendering, client boundaries |

Detection:

```ts
import { getCondition } from "vite-plugin-react-server/config";
const condition = getCondition(); // "react-server" or null
```

The plugin auto-loads the correct implementation:

```ts
const { vitePluginReactServer } = await import(`./plugin.${condition}.js`);
```

## Module Structure

Every feature follows the same pattern:

```
plugin/
├── index.ts              # Condition-based loader
├── plugin.client.ts      # Client environment
├── plugin.server.ts      # Server environment
├── dev-server/
│   ├── index.ts
│   ├── index.client.ts
│   ├── index.server.ts
│   ├── createRscStream.ts
│   ├── createRscStream.client.ts   # Uses rsc-worker
│   ├── createRscStream.server.ts   # Direct rendering
│   └── ...
└── ...
```

**Note:** `.client` and `.server` suffixes in plugin code refer to the Node.js thread condition — *not* to React client/server components.

## Plugin Composition

The plugin is composed of five specialized Vite plugins:

| Plugin | Export path | Purpose |
|--------|-----------|---------|
| Client | `vite-plugin-react-server/client` | Bundles static + client boundary ESM. Manages rsc-worker. |
| Server | `vite-plugin-react-server/server` | Bundles server boundary ESM. Main thread RSC. |
| Static | `vite-plugin-react-server/static` | Serializes pages to `dist/static/`. |
| Transformer | `vite-plugin-react-server/transformer` | Handles `"use client"` / `"use server"` directive transforms. |
| Env | `vite-plugin-react-server/env` | Environment detection and `VITE_*` variable setup. |

## Dev Mode Architecture

### SSR mode (`vite` — no condition)

```
Main thread (client condition)
├── Vite dev server
├── HTML rendering
└── rsc-worker (react-server condition)
    └── RSC rendering via worker_threads
```

### RSC mode (`NODE_OPTIONS='--conditions react-server' vite`)

```
Main thread (react-server condition)
├── Vite dev server
├── RSC rendering (direct, no worker)
└── html-worker (optional)
    └── HTML rendering
```

In RSC mode, the worker is skipped by default (`dev.useRscWorker: false`) because Vite's environment runner handles module invalidation and HMR directly.

## Build Architecture

```
NODE_OPTIONS='--conditions react-server' vite build --app
│
├── 1. Static build → dist/static/  (browser ESM, hashed)
├── 2. Client build → dist/client/  (SSR ESM, bare specifiers)
├── 3. Server build → dist/server/  (server ESM, registerServerReference)
└── 4. Static generation → dist/static/{route}/index.html + index.rsc
```

Builds run in sequence. Each step depends on artifacts from the previous step. Hashes are consistent across all three environments.

## Client-Module AutoDiscovery

The build's client-module input set is the composition of two discoverers, run in order against the same `inputs` record:

| Discoverer | Source file | What it picks up |
|------------|-------------|------------------|
| `createGlobAutoDiscover("**/*.client.*")` | `plugin/config/autoDiscover/createGlobAutoDiscover.ts` | Filename-convention modules (`Foo.client.tsx`, `Bar.client.mjs`, standalone `client.tsx`) |
| `createDirectiveClientAutoDiscover()` | `plugin/config/autoDiscover/createDirectiveClientAutoDiscover.ts` | Directive-only modules — files under `moduleBase` whose source starts with `"use client"` |

The directive discoverer walks `**/*.{tsx,jsx,mts,cts,ts,js,mjs,cjs}` under `moduleBase`, skips `node_modules`, skips files the filename convention already covers, and admits the rest only when `sourceHasTopLevelClientDirective(source)` returns `true`. Without this second pass a plain `Counter.tsx` starting with `"use client"` would never reach `dist/client`, and the server build's `registerClientReference` would point at a missing file.

### index.html script-src filter

The directive discoverer reads `<projectRoot>/index.html` once at discovery time and skips any candidate whose absolute path matches a `<script type="module" src="…">` entry. Two reasons it has to:

1. `processCssFilesForPages` (`plugin/react-static/processCssFilesForPages.ts:34`) calls `collectManifestCss(staticManifest, "index.html")` to derive global CSS for every page, so the static manifest must keep its `index.html` entry.
2. Vite drops the `index.html` manifest entry when an explicit input overlaps with one of its `<script type="module" src>` references — the script-src module would then be treated as the entry and the `index.html` key disappears.

Vite still picks up the script-src module via its own index.html input. The filter keeps the discoverer's `inputs` record from colliding with it. See `createDirectiveClientAutoDiscover.ts:10-24, 60-79`.

## Client-Module Detection

Auto-discovery decides which files become build inputs. Runtime classification (transformer, dev-server file watcher, worker react-loader, build auto-discover, `loader.*` defaults) all route through one helper:

```ts
// plugin/loader/directives/detectClientModule.ts
detectClientModule({ source, moduleId, parseFn? }): boolean
```

The transformer passes rsl's acorn-based `parse` (from `react-server-loader`) as `parseFn` for AST-aware directive analysis — deliberately not the bundler's `this.parse`, which is Rollup (acorn) on Vite 6/7 but Oxc on Vite 8 with a different AST shape. The other call sites omit it and fall back to the parser-free char-scanner in `sourceHasTopLevelClientDirective.ts`. Both paths agree on every well-authored case.

The filename half — `CLIENT_FILENAME_PATTERN = /(^|[\/.])client\.[cm]?[jt]sx?$/` — matches the dotted-suffix convention (`Foo.client.tsx`) and the standalone basename (`client.tsx`/`.ts`/etc.). The leading-`(^|[\/.])` anchor keeps it strict: `clientUtils.ts` is NOT matched.

## Worker Communication

Workers use `worker_threads` with a message-based protocol:

**Main → Worker:**
- `ROUTE_READY` — initialize render for a route
- `RSC_CHUNK` — chunk of RSC content
- `RSC_END` — end of RSC stream
- `CLEANUP` — clean up route resources
- `SHUTDOWN` — terminate worker

**Worker → Main:**
- `READY` — worker initialized
- `HTML_CHUNK` — chunk of rendered HTML
- `HTML_COMPLETE` — rendering finished
- `ERROR` — something went wrong

See [Workers](./workers.md) for implementation details.

## Serialization Boundaries

What can cross worker boundaries:

| ✅ Serializable | ❌ Not serializable |
|----------------|-------------------|
| URL strings (`Page`, `Html`, `Root`, `props`) | Direct React components (`components.*`) |
| Streams (RSC/HTML) | `children` props |
| RegExp patterns | Functions (closures) |

This is why path-based resolution works in both modes, but `components.*` only works with `react-server` on the main thread.

## Building on the contract

The user-facing surface stops deliberately short of a framework: the plugin
emits the [build output](../build-output.md) and hands you the serving. That
same contract is enough to build a meta-framework on — a router with its own
conventions, a CMS-backed page factory, a deploy pipeline — because everything
downstream of the build consumes documented artifacts, not plugin internals.

[mmc](https://github.com/nicobrinkkemper/mmc) is the living example: a small
meta-framework grown alongside vprs, 284 prerendered pages with per-theme
layouts and generated props. It started life as a create-react-app project,
which also makes it the proof of the migration path: CRA to Vite to RSC
without a framework rewrite.

If you're building on the contract, reach out early —
[open an issue](https://github.com/nicobrinkkemper/vite-plugin-react-server/issues)
rather than building in isolation. The plugin is under active development:
PRs get reviewed, and an idea that needs a seam the plugin doesn't expose yet
is exactly the input we want.
