# Worker Communication Architecture

## Overview

The plugin has two execution modes with different communication patterns:

### Dev Mode (default): No Workers

By default in development, RSC rendering happens on the main thread via Vite's Environment API (`server.environments['server'].runner`). **No workers or MessagePorts are created.** This means:
- Zero port overhead per request
- HMR works natively (environment runner handles cache invalidation)
- No listener accumulation concerns

Set `dev.useRscWorker: true` to opt into the worker path in dev mode.

### Production / Worker Mode: MessagePort Channels

When workers are used (production builds, or `dev.useRscWorker: true`), the communication uses `MessagePort` pairs:

#### Startup (once)
| Channel | Ports | Purpose |
|---------|-------|---------|
| `parentPort` | 1 | Main worker message bus |
| `reactLoaderChannel` | 2 | Loading React components |
| `cssLoaderChannel` | 2 | Loading CSS files |
| `envLoaderChannel` | 2 | Loading environment variables |
| `hmrChannel` (dev only) | 2 | Hot module replacement |
| **Total** | 7-9 | |

#### Per Request
| Channel | Ports | Purpose |
|---------|-------|---------|
| `dataChannel` | 2 | Streaming RSC data |
| `controlChannel` | 2 | Control messages (end, error, metrics) |
| **Total** | 4 | Created via `createMessageChannels()` |

## Port Lifecycle

Per-request ports (`dataChannel`, `controlChannel`) are **not explicitly closed** after the request completes. The code comments state:

> "We don't close ports here — let the stream consumer manage port lifecycle. This ensures `createFromNodeStream()` can fully consume the stream."

Cleanup relies on garbage collection. This is intentional to avoid premature port closure while React is still consuming the stream, but means ports may accumulate under high concurrency.

### `setMaxListeners` Helper

The plugin sets high listener limits (15-20) on ports via `plugin/stream/setMaxListeners.ts` to suppress Node.js `MaxListenersExceededWarning`. This is a workaround, not a fix — the real solution would be explicit port cleanup after stream consumption.

## Loader Channels

All three loader channels (`react`, `css`, `env`) are created at worker startup regardless of whether they're all needed. In practice:
- `reactLoaderChannel`: Always used (loads page/root/html components)
- `cssLoaderChannel`: Used when CSS files exist for the route
- `envLoaderChannel`: Used for environment variable injection

These could be lazy-initialized but the overhead is minimal since they're created once.

## Potential Improvements

1. **Explicit port cleanup**: Close `dataChannel`/`controlChannel` ports after the response stream ends. Would need careful timing to not cut off React's stream consumption.
2. **Port pooling**: Reuse data/control port pairs across requests instead of creating new ones.
3. **Lazy loader channels**: Only create `cssLoaderChannel`/`envLoaderChannel` when first needed.

None of these are urgent since the default dev mode doesn't use workers at all. Production builds use parallel rendering (batch size 8 by default), but each page gets its own worker which is terminated after use.
