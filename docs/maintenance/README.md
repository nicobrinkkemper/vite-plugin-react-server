# Maintenance Guide

Internal documentation for plugin maintainers and contributors.

## Test Status

Run the full suite with `npm test` (unit) and the e2e specs under `test/e2e/`. The current counts move with the codebase — see CI for the canonical numbers.

## Documentation Index

Filenames are in backticks so markdown doesn't italicize the `_` in names like
`ERROR_HANDLING.md`.

| File | Description |
|------|-------------|
| [`architecture.md`](../internals/architecture.md) | Internal architecture and design |
| [`transformer.md`](../internals/transformer.md) | The transform/loader system |
| [`workers.md`](../internals/workers.md) | Worker system (RSC + HTML workers) |
| [`advanced-topics.md`](../internals/advanced-topics.md) | Custom workers, message system, extending the plugin |
| [`module-resolution-escape-hatches.md`](../internals/module-resolution-escape-hatches.md) | Module-resolution escape hatches |
| [`router-v2-parity.md`](../internals/router-v2-parity.md) | Router v2 parity spec and conventions |
| [`COMMON_ISSUES.md`](../internals/COMMON_ISSUES.md) | Frequently encountered problems and solutions |
| [`DEBUGGING.md`](../internals/DEBUGGING.md) | Debugging techniques and tools |
| [`ERROR_HANDLING.md`](../internals/ERROR_HANDLING.md) | Error handling patterns and recovery |
| [`TESTING.md`](../internals/TESTING.md) | Test infrastructure and commands |

## Architecture Overview

The plugin has two execution modes:

### Dev Mode (default)
- RSC rendering in a dedicated RSC worker by default (`DEV.useRscWorker`); when Vite itself runs under `--conditions react-server`, rendering happens on the main thread via Vite's Environment API (`server.environments['server'].runner`)
- No HTML worker (`DEV.useHtmlWorker: false` — the browser renders the HTML)
- HMR via `hotUpdate` hook (Vite Environment API)
- Client components → `@vitejs/plugin-react` Fast Refresh
- Server components → RSC refetch via custom WS event
- CSS → RSC refetch (inlined in stream)

### Production Build
- Worker-based parallel rendering (batch size 8 by default)
- `react-server-dom-esm` vendored via `react-server-loader` (symlink auto-created in `configResolved`)
- Static HTML + RSC output per page

## Releasing

See [../releasing.md](../releasing.md) for the full release process.
