# CSS Handling

The plugin collects CSS from your component imports and hands it to your
document as ready-to-render tag props. What the build emits and how each file
ends up inlined or linked is part of the
[build output contract](./build-output.md#css-in-the-output). This page covers
the CSS-specific pieces: rendering, configuration, and filtering.

## Rendering CSS

Your `Html` and `Root` components receive the `globalCss` (site-wide) and
`cssFiles` (per-page) maps. Render them with the `Css` component:

```tsx
import { Css } from "vite-plugin-react-server/components";

export const Html = ({ Root, cssFiles, globalCss, pageProps, Page }: HtmlProps) => (
  <html>
    <head>
      <Css cssFiles={globalCss} />
    </head>
    <body>
      <Root as="div" id="root" cssFiles={cssFiles} Page={Page} pageProps={pageProps} />
    </body>
  </html>
);

export const Root = ({ cssFiles, Page, pageProps, ...props }) => (
  <div {...props}>
    <Page {...pageProps} />
    <Css cssFiles={cssFiles} />
  </div>
);
```

## Configuration

```ts
css: {
  inlineCss: undefined,   // auto; `false` disables inlining
  inlineThreshold: 4096,  // inline files up to this many bytes (0 = inline all)
  inlinePatterns: [],     // RegExp[], always inline matching files
  linkPatterns: [],       // RegExp[], always link matching files
}
```

## CSS Modules

Standard Vite CSS modules work as expected:

```tsx
import styles from "./page.module.css";

export const Page = () => <div className={styles.container}>Hello</div>;
```

## Filtering CSS

The maps are plain data, so a Root can drop entries before rendering:

```tsx
const filtered = new Map(
  [...cssFiles].filter(([key]) => !key.includes(".dark"))
);
```

## Helper Imports

```ts
import { collectViteModuleGraphCss, createCssProps } from "vite-plugin-react-server/helpers";
```
