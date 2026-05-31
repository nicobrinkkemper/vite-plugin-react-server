# React Compatibility

## Supported Versions

The plugin vendors a build of `react-server-dom-esm` whose internals (taint registries on `ReactSharedInternalsServer`, etc.) are tied to React's experimental release channel. Stable React 19.x doesn't expose the same internals — see PR #32.

| React Version | Support | Notes |
|---------------|---------|-------|
| `react@experimental` (any `0.0.0-experimental-*` prerelease) | ✅ Supported | The vendored `oss-experimental/react-server-dom-esm` matches React's experimental internals |
| React 19+ stable | ❌ Not supported (yet) | Stable React's `ReactSharedInternalsServer` is missing the taint registries the vendored rsd-esm reads at module init, causing `Cannot read properties of undefined (reading 'add')` in `RequestInstance` during the static build path. A future plugin version will ship per-React-channel loader builds — tracked separately. |
| React 18 stable | ❌ Not supported | Missing RSC APIs |

```bash
npm install react@experimental react-dom@experimental
```

For reproducibility, pin a specific experimental SHA — for example, the version the plugin is currently developed against:

```bash
npm install react@0.0.0-experimental-f93b9fd4-20251217 react-dom@0.0.0-experimental-f93b9fd4-20251217
```

**Peer dependency**: `react: ">=0.0.0-experimental-0 <1.0.0"`. The upper bound rejects stable React (19.x, 20.x) so npm warns instead of resolving silently to a broken pairing. Any 0.0.0 prerelease (experimental, canary, next) satisfies the lower bound.

> Earlier 1.4.x docs claimed "React 19+ stable: Full Support." That was incorrect — local development with `file:` link masked the mismatch by hoisting the plugin's own experimental React into the consumer. npm-installed consumers crashed in the static build path. See PR #32.

## Vendored ESM Transport

Since v1.3.0, the plugin **vendors `react-server-dom-esm`** — no separate install or patching needed.

### How It Works

1. A pre-built copy lives in `oss-experimental/react-server-dom-esm/`
2. A Vite alias plugin resolves all `react-server-dom-esm/*` imports to this copy
3. In dev mode, a symlink is auto-created in `node_modules/` (via `configResolved`)
4. Server-side entries are marked external during builds and resolved at runtime via `createRequire`

### Runtime Usage Outside Vite

If you use plugin utilities outside of Vite (startup scripts, SSR servers), register the resolver:

```bash
node --import vite-plugin-react-server/register ./your-script.mjs
```

### Updating the Vendored Copy

Plugin maintainers can refresh from React source:

```bash
npm run experimental:build-oss
```

## Type System

The plugin exports generic types that adapt to your React version. For most usage, the defaults work:

```tsx
import type { HtmlProps, RootProps, PageComponentType } from "vite-plugin-react-server/types";
import { Css } from "vite-plugin-react-server/components";

export const Html = ({ Root, cssFiles, globalCss, pageProps, Page }: HtmlProps) => (
  <html>
    <head>
      <Css cssFiles={globalCss} />
    </head>
    <body>
      <Root cssFiles={cssFiles} Page={Page} pageProps={pageProps} />
    </body>
  </html>
);
```

For custom type constraints, the generics accept `PageProps`, `As`, `InlineCSS`, and `ReactType` parameters. See [`plugin/types.ts`](https://github.com/nicobrinkkemper/vite-plugin-react-server/blob/main/plugin/types.ts) for full signatures, or the simplified versions in [API Reference](./api-reference.md#component-types).

## Type Declarations

Add to your `tsconfig.json` for virtual module types:

```json
{
  "compilerOptions": {
    "types": ["vite-plugin-react-server/virtual"]
  }
}
```

This provides types for `virtual:react-server/hmr`, `import.meta.env.PUBLIC_ORIGIN`, and other virtual modules.

<!-- TOC START -->

## 📚 Documentation Navigation

<!-- Auto-generated TOC - Do not edit manually -->

## Table of Contents

<!-- Auto-generated TOC - Do not edit manually -->



1.	[Getting Started](./getting-started.md)
2.	[Core Concepts](./core-concepts.md)
3.	[Configuration Guide](./configuration.md)
4.	[CSS & Styling](./css-handling.md)
5.	[Server Actions](./server-actions.md)
6.	[Build & Deployment](./build-orchestration.md)
7.	[Advanced Development](./maintenance/advanced-topics.md)
8.	[Plugin Internals](./maintenance/transformer-plugin.md)
9.	[Worker System](./maintenance/rsc-worker.md)
10.	[API Reference](./api-reference.md)
11.	**[React Compatibility](./react-type-compatibility.md) ← you are here**
12.	[Troubleshooting](./troubleshooting-guide.md)
13.	[Package Exports](./package-exports.md)
14.	[Transformations](./transformations.md)

### Quick Links
- [🏠 Main Documentation](./README.md)
- [🚀 Getting Started](./getting-started.md)
- [📖 GitHub Repository](https://github.com/nicobrinkkemper/vite-plugin-react-server)
- [🎮 Official Demo](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)

---

<!-- TOC END -->
