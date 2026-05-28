# Storybook

vprs ships a Storybook preset so your RSC app's components build and render in
Storybook with one line.

```ts
// .storybook/main.ts
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  framework: { name: "@storybook/react-vite", options: {} },
  addons: ["vite-plugin-react-server/storybook"],
};

export default config;
```

Requires vprs ≥ 1.9.0. Use the `@storybook/react-vite` framework.

## Why it's needed

A vprs app can't be bundled by Storybook out of the box. The Vite plugin assumes
RSC entry points (`Page`/`props`/`Html`) and intercepts `/`, so Storybook has to
strip it — but stripping it also removes the resolver for the bare
`react-server-dom-esm/client.browser` import that vprs's RSC-client utilities
emit (`react-server-dom-esm` is vendored inside vprs, not a standalone npm
package). Without help, the bare import is unresolvable and the Storybook build
fails. The preset re-creates exactly the configuration you'd otherwise hand-roll
in `viteFinal`.

## What the preset does

- **Strips** the `vite-plugin-react-server` plugin from Storybook's builder config.
- **Resolves** `react-server-dom-esm/client.browser` to the ESM build vprs hosts
  at `vite-plugin-react-server/react-server-dom-esm/client.browser`.
- **Externalizes** `virtual:react-server/hmr` (only the stripped plugin provides it).
- **Silences** the `MODULE_LEVEL_DIRECTIVE` warning Rollup emits for every
  `"use client"` / `"use server"` file when bundling UI libraries (Chakra, Ark,
  MUI, …). It preserves any `onwarn` you've configured.

## What it does not do

- It does **not** render React Server Components via the RSC wire protocol.
  Write stories for the **client** components your app composes — the preset
  makes the build resolve, it isn't a server-render shim.
- It does **not** configure your UI library's theme. Add your provider as a
  decorator in `.storybook/preview`:

```tsx
// .storybook/preview.tsx
import type { Preview } from "@storybook/react-vite";
import { MyThemeProvider } from "../src/theme";

const preview: Preview = {
  decorators: [(Story) => <MyThemeProvider><Story /></MyThemeProvider>],
};

export default preview;
```

## Related

- [Third-party `"use client"` packages](../README.md#third-party-use-client-packages)
  — how vprs detects UI libraries that ship directives.
