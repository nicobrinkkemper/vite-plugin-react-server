# React Compatibility

## Supported Versions

The plugin runs on **stable React 19.2+**. The RSC server APIs it depends on
(`prerenderToNodeStream` and the `react-server` transport exports) are part of
stable React. The RSC transport itself is an implementation detail, supplied by
the [`react-server-loader`](https://www.npmjs.com/package/react-server-loader)
dependency, whose peer range pins the exact React build the transport was
vendored against.

| React Version | Support | Notes |
|---------------|---------|-------|
| React 19.2+ stable | ✅ Supported | The default. `react-server-loader`'s stable train vendors a transport built against this line; install plain `react` / `react-dom` and the peer ranges line up. |
| `react@experimental` (any `0.0.0-experimental-*` prerelease) | ✅ Supported | Still works for the newest RSC features. Use `react-server-loader@experimental`, which pins the exact experimental React it was built against. |
| React 19.0 / 19.1 stable | ⚠️ Untested | Missing the stable prerender/transport APIs vprs depends on; upgrade to 19.2+. |
| React 18 stable | ❌ Not supported | Missing RSC APIs |

```bash
npm install react@^19.2.7 react-dom@^19.2.7
```

For the experimental train, pin the exact React `react-server-loader@experimental`
was built against (the `@experimental` dist-tag moves daily):

```bash
npm view react-server-loader@experimental peerDependencies
npm install react@<that-exact-version> react-dom@<that-exact-version>
```

`react-server-loader` is a regular **dependency** whose range admits the
stable train plus the exact experimental build this release was verified
against — check `dependencies["react-server-loader"]` in vprs's
[`package.json`](https://github.com/nicobrinkkemper/vite-plugin-react-server/blob/main/package.json)
for the current range. Every package manager installs it for you — the stable
train by default, no extra step (yarn included).

To run the experimental train, install all three React packages at the
`@experimental` tag. The loader's range also admits that experimental build, so
npm collapses to a single copy alongside your experimental React — no
`overrides`, no duplicate in the tree:

```bash
npm install react@experimental react-dom@experimental react-server-loader@experimental
```

One practical reason to run experimental: stable React 19.2.x emits its
CSS preload hint as an invalid `as="stylesheet"`, so browsers ignore the
preload; styles still load, just not preloaded (see
[troubleshooting](./troubleshooting.md)). The experimental channel carries
the fix.

**React peer**: `react` / `react-dom` at `^19.2.7 || >=0.0.0-0 <0.0.1` (admits
both trains). The transport binds to a single React build's internals and
throws on a mismatch, so keep `react`, `react-dom`, and `react-server-loader`
on the same train. See
[`react-server-loader`'s versioning](https://www.npmjs.com/package/react-server-loader)
for why the versions line up the way they do.

## Why the transport is vendored, not installed from npm

`react-server-loader` vendors both flight transports: `react-server-dom-esm`,
which has never been published to npm (the name there is an empty `0.0.1`
placeholder), and `react-server-dom-webpack`, which *is* published. That second
half is the tell — this is not a workaround for a missing package. Other RSC
integrations make the same call (Vite's own `@vitejs/plugin-rsc` vendors the
webpack transport too), because a flight transport binds to the internals of
one exact React build. Shipping a copy pinned to the React it was built against
is the only way to guarantee the pair agree; an npm install with a floating
range cannot.

Publishing `react-server-dom-esm` was proposed upstream
([facebook/react#36768](https://github.com/facebook/react/pull/36768)) and
rejected. The esm transport also ships without the reference-manifest layer the
webpack variant gets from its bundler, so any loader adopting it has to own
that layer anyway — `react-server-loader` does. Vendoring is the design, not a
stopgap: to move React versions, bump `react-server-loader` together with the
matching `react` / `react-dom` as described above.

## ESM Transport

The plugin consumes a vendored build of `react-server-dom-esm` from the
`react-server-loader` dependency — no separate install or patching needed.

### How It Works

1. The transport ships inside `react-server-loader` (`node_modules/react-server-loader/vendor/react-server-dom-esm/`); a single `transportDir` helper resolves it via the package.
2. A Vite alias plugin resolves all `react-server-dom-esm/*` imports to that copy.
3. A `node_modules/react-server-dom-esm` symlink is auto-created (via `configResolved`, on every Vite startup) so Vite's module runner and the RSC worker resolve the bare specifier natively.
4. Server-side entries are marked external during builds under the bare specifier and resolved at runtime through that symlink (or the RSC worker's loader hook).

### Runtime Usage Outside Vite

If you use plugin utilities outside of Vite (startup scripts, SSR servers), register the resolver:

```bash
node --import vite-plugin-react-server/register ./your-script.mjs
```

### Updating the Transport

The transport is built and vendored by [`react-server-loader`](https://github.com/nicobrinkkemper/react-server-loader). To move to a newer React, bump the `react-server-loader` dependency together with the matching `react` / `react-dom`.

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
