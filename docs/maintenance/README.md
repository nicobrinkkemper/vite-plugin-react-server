# Maintenance Guide

Internal documentation for plugin maintainers and contributors.

## Test Status

Run the full suite with `npm test` (unit) and the e2e specs under `test/e2e/`. The current counts move with the codebase — see CI for the canonical numbers.

## Documentation Index

Filenames are in backticks so markdown doesn't italicize the `_` in names like
`DEV_CACHING_ISSUE.md`.

| Doc | Description |
|-----|-------------|
| [`architecture.md`](../internals/architecture.md) | Internal architecture and design (concise) |
| [`PLUGIN_ARCHITECTURE.md`](../internals/PLUGIN_ARCHITECTURE.md) | Internal architecture and design patterns (long form) |
| [`transformer.md`](../internals/transformer.md) | The transform/loader system (concise) |
| [`transformer-plugin.md`](./transformer-plugin.md) | Transformation process and loader system (long form) |
| [`workers.md`](../internals/workers.md) | Worker system (concise) |
| [`rsc-worker.md`](./rsc-worker.md) | Worker system implementation (long form) |
| [`MESSAGE_PORTS_ANALYSIS.md`](../internals/MESSAGE_PORTS_ANALYSIS.md) | Worker communication architecture |
| [`module-resolution-escape-hatches.md`](../internals/module-resolution-escape-hatches.md) | Module-resolution escape hatches |
| [`COMMON_ISSUES.md`](../internals/COMMON_ISSUES.md) | Frequently encountered problems and solutions |
| [`DEBUGGING.md`](../internals/DEBUGGING.md) | Debugging techniques and tools |
| [`DEV_CACHING_ISSUE.md`](../internals/DEV_CACHING_ISSUE.md) | Dev mode caching issue (resolved) |
| [`ERROR_HANDLING.md`](../internals/ERROR_HANDLING.md) | Error handling patterns and recovery |
| [`TESTING.md`](../internals/TESTING.md) | Test infrastructure and commands |
| [`advanced-topics.md`](../internals/advanced-topics.md) | Custom workers, message system, extending the plugin |

## Architecture Overview

The plugin has two execution modes:

### Dev Mode (default)
- RSC rendering on main thread via Vite's Environment API (`server.environments['server'].runner`)
- No workers or MessagePorts
- HMR via `hotUpdate` hook (Vite 6 Environment API)
- Client components → `@vitejs/plugin-react` Fast Refresh
- Server components → RSC refetch via custom WS event
- CSS → RSC refetch (inlined in stream)

### Production Build
- Worker-based parallel rendering (batch size 8 by default)
- `react-server-dom-esm` vendored (symlink auto-created in `configResolved`)
- Static HTML + RSC output per page

## Releasing

See [../releasing.md](../releasing.md) for the full release process.
