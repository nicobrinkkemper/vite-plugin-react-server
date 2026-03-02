# Maintenance Guide

Internal documentation for plugin maintainers and contributors.

## Test Status

- **Vitest**: 153 unit tests passing (run with `npm test`)
- **Playwright**: 9 e2e HMR tests passing (run with `npx playwright test test/e2e/hmr.spec.ts`)

See [TESTING.md](./TESTING.md) for details.

## Documentation Index

| File | Description |
|------|-------------|
| [COMMON_ISSUES.md](./COMMON_ISSUES.md) | Frequently encountered problems and solutions |
| [DEBUGGING.md](./DEBUGGING.md) | Debugging techniques and tools |
| [DEV_CACHING_ISSUE.md](./DEV_CACHING_ISSUE.md) | Dev mode caching issue (resolved) |
| [ERROR_HANDLING.md](./ERROR_HANDLING.md) | Error handling patterns and recovery |
| [MESSAGE_PORTS_ANALYSIS.md](./MESSAGE_PORTS_ANALYSIS.md) | Worker communication architecture |
| [PLUGIN_ARCHITECTURE.md](./PLUGIN_ARCHITECTURE.md) | Internal architecture and design patterns |
| [TESTING.md](./TESTING.md) | Test infrastructure and commands |
| [advanced-topics.md](./advanced-topics.md) | Custom workers, message system, extending the plugin |
| [rsc-worker.md](./rsc-worker.md) | Worker system implementation |
| [transformer-plugin.md](./transformer-plugin.md) | Transformation process and loader system |

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
