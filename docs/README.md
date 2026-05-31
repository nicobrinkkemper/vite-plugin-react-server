# Documentation

## User Guide

1. [Getting Started](./getting-started.md) — install, first page, dev server, build, deploy
2. [Build Output](./build-output.md) — what the build produces, using ESM modules
3. [Configuration](./configuration.md) — all plugin options
4. [CSS Handling](./css-handling.md) — inline/linked CSS, CSS modules
5. [Server Actions](./server-actions.md) — `"use server"` directives, form actions
6. [Storybook](./storybook.md) — the `vite-plugin-react-server/storybook` preset for rendering your RSC components in stories
7. [Examples](./examples.md) — static site, dynamic server, custom routing
8. [Troubleshooting](./troubleshooting.md) — common errors and fixes
9. [API Reference](./api-reference.md) — exported functions, types, components

## Internals (contributors)

10. [Architecture](./internals/architecture.md) — condition system, module structure, plugin composition
11. [Transformer](./internals/transformer.md) — directive handling and code transforms
12. [Workers](./internals/workers.md) — RSC and HTML worker threads
13. [Module-resolution escape hatches](./internals/module-resolution-escape-hatches.md) — when to reach for `external`, `noExternal`, `optimizeDeps`, virtual stubs, vendor aliases (and how to pick the right one)

## Maintenance

14. [Releasing](./releasing.md) — version bumps, publishing, demo updates
15. [React Compatibility](./react-type-compatibility.md) — vendored ESM transport, type system

## Links

- [GitHub Repository](https://github.com/nicobrinkkemper/vite-plugin-react-server)
- [Official Demo (bidoof-template)](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)
- [Production Example (mmc)](https://github.com/nicobrinkkemper/mmc)
