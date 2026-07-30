# Documentation

The build turns your app into a portable set of ESM artifacts plus manifests,
described in [Build Output](./build-output.md). That contract is the center of
these docs: every way of shipping a vprs app is a recipe consuming it, and the
guides below are organized around the three ways people actually ship.

## Start here

- [Getting Started](./getting-started.md) — install, first page, dev server, build, deploy
- [Build Output](./build-output.md) — the contract: what the build emits and how it is meant to be consumed

## Three ways to ship

One build, three deploy shapes. Pick the one that matches what you're building.

**1. A content site on dumb hosting** — GitHub Pages, FTP, S3, any CDN.
`dist/static/` is the whole deployment: prerendered HTML, `.rsc` payloads
for client-side navigation, hashed assets.
No runtime, nothing to operate — and `build.edge: false` skips the server
bundle this shape never uses.
[Getting Started → Deploy](./getting-started.md#deploy-to-github-pages) ·
[Examples → Static Site](./examples.md#static-site-github-pages) ·
[Build Output → Turning outputs off](./build-output.md#turning-outputs-off)

**2. RSC inside a server you own** — plain Node, Express, a serverless
function. `createRequestHandler` serves the static output correctly,
dispatches `"use server"` [actions](./server-actions.md) through the sealed
baked gate, and renders dynamic routes per request through the
[single-isolate edge bundle](./edge.md) — flash-free streaming SSR from one
Web `fetch` handler, no workers and no `--conditions`; Cloudflare Workers /
Deno Deploy via the webpack transport's baked consumer.
[Build Output → Using the ESM modules in a server](./build-output.md#using-the-esm-modules-in-a-server) ·
[Examples → Dynamic Server](./examples.md#dynamic-server-node--express)

**3. Mixed rendering from one build** — prerender the content routes, render
the per-request ones dynamically, and ship both as one deploy with client-side
navigation across the boundary.
[Build Output → Where it runs](./build-output.md#where-it-runs-static-anywhere-dynamic-on-node) ·
[Configuration → Transport](./configuration.md#transport)

## Reference

- [Routing](./routing.md) — the file-based router: params, loaders, nested layouts, prerendering, client-side `Link`
- [Configuration](./configuration.md) — all plugin options
- [CSS Handling](./css-handling.md) — inline vs linked CSS, CSS modules
- [Server Actions](./server-actions.md) — `"use server"`, form actions
- [Storybook](./storybook.md) — rendering RSC components in stories
- [Examples](./examples.md) — static site, dynamic server, custom routing
- [Troubleshooting](./troubleshooting.md) — common errors and fixes
- [React Compatibility](./react-type-compatibility.md) — supported React versions, the vendored transport, and the type system
- [API Reference](./api-reference.md) — exports, types, components, defaults
- [Comparison](./comparison.md) — how vprs differs from Next.js, Waku, and `@vitejs/plugin-rsc`

## Maintenance

- [Releasing](./releasing.md) — version bumps, publishing, demo updates

## Internals (contributors)

- [Architecture](./internals/architecture.md) — condition system, module structure, plugin composition
- [Building on the contract](./internals/architecture.md#building-on-the-contract) — using vprs as the base of your own framework
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
