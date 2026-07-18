# Documentation

## User guide

Read in order if you're new; each stands alone otherwise.

- [Getting Started](./getting-started.md) — install, first page, dev server, build, deploy
- [Routing](./routing.md) — the file-based router: params, loaders, nested layouts, prerendering, client-side `Link`
- [Configuration](./configuration.md) — all plugin options
- [Build Output](./build-output.md) — what the build produces, and how to serve it
- [CSS Handling](./css-handling.md) — inline vs linked CSS, CSS modules
- [Server Actions](./server-actions.md) — `"use server"`, form actions
- [Edge / Single-Isolate](./edge.md) — flash-free SSR from one Web `fetch` handler, no workers and no `--conditions`, on Node-compatible hosts
- [Storybook](./storybook.md) — rendering RSC components in stories
- [Examples](./examples.md) — static site, dynamic server, custom routing
- [Troubleshooting](./troubleshooting.md) — common errors and fixes
- [API Reference](./api-reference.md) — exports, types, components, defaults
- [Comparison](./comparison.md) — how vprs differs from Next.js, Waku, and `@vitejs/plugin-rsc`

## Maintenance

- [Releasing](./releasing.md) — version bumps, publishing, demo updates
- [React Compatibility](./react-type-compatibility.md) — the vendored ESM transport and the type system

## Internals (contributors)

- [Architecture](./internals/architecture.md) — condition system, module structure, plugin composition
- [Transformer](./internals/transformer.md) — directive handling and code transforms
- [Workers](./internals/workers.md) — the RSC and HTML worker threads
- [Module-resolution escape hatches](./internals/module-resolution-escape-hatches.md) — `external`, `noExternal`, `optimizeDeps`, virtual stubs, vendor aliases, and how to pick
- [Advanced topics](./internals/advanced-topics.md)
- [Testing](./internals/TESTING.md) — the fixture/`doBuild` harness
- [Error handling](./internals/ERROR_HANDLING.md) · [Debugging](./internals/DEBUGGING.md) · [Common issues](./internals/COMMON_ISSUES.md)

### Design notes (not user-facing)

Specs for work that is in progress or was reasoned through once. They describe
intent, not necessarily what ships today.

- [Router v2 parity spec](./internals/router-v2-parity.md)
- [Dev caching investigation](./internals/DEV_CACHING_ISSUE.md)
- [Message ports analysis](./internals/MESSAGE_PORTS_ANALYSIS.md)

## Links

- [GitHub Repository](https://github.com/nicobrinkkemper/vite-plugin-react-server)
- [Official Demo (bidoof-template)](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)
- [Production Example (mmc)](https://github.com/nicobrinkkemper/mmc)
