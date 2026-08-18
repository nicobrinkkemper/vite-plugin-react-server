# Storybook

vprs ships a Storybook preset (`vite-plugin-react-server/storybook`) for the
`@storybook/react-vite` framework:

```ts
// .storybook/main.ts
export default {
  framework: { name: "@storybook/react-vite", options: {} },
  addons: ["vite-plugin-react-server/storybook"],
};
```

## Default: the plugin stays active, RSC works

By default the preset keeps the vprs plugin in Storybook's builder config. The
RSC dev server runs inside Storybook and Server Components stream for real —
the `.rsc` routes are served, so a story can render the live app via
`createReactFetcher`. No launch flag is needed: the plugin sets the
`react-server` condition per-environment and the RSC worker sets it for
itself, so plain `storybook dev` is enough.

In this mode the preset changes one thing: it silences the
`MODULE_LEVEL_DIRECTIVE` warning Rollup emits for every `"use client"` /
`"use server"` file when bundling UI libraries (Chakra, Ark, MUI, …). It
preserves any `onwarn` you've configured.

## Opt-out: `rsc: false` for a client-only build

```ts
// .storybook/main.ts
export default {
  framework: { name: "@storybook/react-vite", options: {} },
  addons: [{ name: "vite-plugin-react-server/storybook", options: { rsc: false } }],
};
```

This is the lighter, no-RSC-worker build for projects that only story client
components. The preset strips every `vite-plugin-react-server` plugin from the
builder config and re-adds the shims the stripped plugin would otherwise have
provided:

- **Resolves** `react-server-dom-esm/client.browser` to the ESM build shipped
  by the `react-server-loader` peer dependency at
  `react-server-loader/client.browser` (`react-server-dom-esm` is vendored
  inside `react-server-loader`, not a standalone npm package — without the
  shim the bare import is unresolvable).
- **Stubs** `virtual:react-server/hmr` with a browser-safe no-op module that
  mirrors the real virtual's export shape (`RSC_HMR_EVENT`, `useRscHmr`,
  `setupRscHmr`). The real provider lives in the stripped dev-server plugin;
  stories don't talk to a vprs dev server, so a no-op is the correct
  semantics. It is a resolve+load stub, not a Rollup `external` — a
  `virtual:` URL left external would fail to fetch in the browser.
- **Drops** `react-server-dom-esm` entries from `optimizeDeps.include`.

The directive-warning silencing applies in this mode too.

## What it does not do

The preset does not configure your UI library's theme — add your provider as a
decorator in `.storybook/preview` as you would in any Storybook project.

## Related

- [Third-party `"use client"` packages](./configuration.md#third-party-use-client-packages)
  — how vprs detects UI libraries that ship directives.
