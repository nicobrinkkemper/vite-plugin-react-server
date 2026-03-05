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
