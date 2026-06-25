# Documentation

## User Guide

1. [Getting Started](./getting-started.md) — install, first page, dev server, build, deploy
2. [Build Output](./build-output.md) — what the build produces, using ESM modules
3. [Configuration](./configuration.md) — all plugin options
4. [CSS Handling](./css-handling.md) — inline/linked CSS, CSS modules
5. [Server Actions](./server-actions.md) — `"use server"` directives, form actions
6. [Storybook](./storybook.md) — the `vite-plugin-react-server/storybook` preset for rendering your RSC components in stories
7. [Edge / Single-Isolate](./edge.md) — flash-free SSR from one Web `fetch` handler, no workers or `--conditions` (Cloudflare/Deno/Vercel/Bun)
8. [Examples](./examples.md) — static site, dynamic server, custom routing
9. [Troubleshooting](./troubleshooting.md) — common errors and fixes
10. [API Reference](./api-reference.md) — exported functions, types, components

## Internals (contributors)

11. [Architecture](./internals/architecture.md) — condition system, module structure, plugin composition
12. [Transformer](./internals/transformer.md) — directive handling and code transforms
13. [Workers](./internals/workers.md) — RSC and HTML worker threads
14. [Module-resolution escape hatches](./internals/module-resolution-escape-hatches.md) — when to reach for `external`, `noExternal`, `optimizeDeps`, virtual stubs, vendor aliases (and how to pick the right one)

## Maintenance

15. [Releasing](./releasing.md) — version bumps, publishing, demo updates
16. [React Compatibility](./react-type-compatibility.md) — vendored ESM transport, type system

## Links

- [GitHub Repository](https://github.com/nicobrinkkemper/vite-plugin-react-server)
- [Official Demo (bidoof-template)](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)
- [Production Example (mmc)](https://github.com/nicobrinkkemper/mmc)
