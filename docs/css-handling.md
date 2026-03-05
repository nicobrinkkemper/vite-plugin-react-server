# CSS Handling

The plugin collects CSS from your component imports and passes it as props to your components.

## How It Works

1. CSS files imported by components are collected during build
2. Each file is processed by `createCssProps` — either inlined as `<style>` or linked as `<link>`
3. Processed CSS is passed as `cssFiles` (per-page) and `globalCss` (site-wide) to your `Html` and `Root` components

## Rendering CSS

Use the `Css` component:

```tsx
import { Css } from "vite-plugin-react-server/components";

// In your Html component
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

// In your Root component
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
  inlineCss: true,            // enable inlining (default: true)
  inlineThreshold: 4096,      // files < 4KB are inlined
  inlinePatterns: [],          // RegExp[] — always inline matching files
  linkPatterns: [],            // RegExp[] — always link matching files
}
```

Force all CSS inline:

```ts
css: { inlineCss: true, inlineThreshold: 0 }
```

## CssContent Type

Each entry in `cssFiles` is either:

```ts
// Inlined (small file)
{ as: "style", type: "text/css", id: string, children: string }

// Linked (large file)
{ as: "link", id: string, rel: "stylesheet", href: string }
```

## CSS Modules

Standard Vite CSS modules work as expected:

```tsx
import styles from "./page.module.css";

export const Page = () => <div className={styles.container}>Hello</div>;
```

## Development vs Production

- **Dev**: CSS collected from Vite's module graph on each request. Full HMR support.
- **Build**: CSS collected at build time, processed once, inlined or linked per configuration.

## Filtering CSS

You can filter the `cssFiles` map in your Root component:

```tsx
export const Root = ({ cssFiles, Page, pageProps, ...props }) => {
  const filtered = new Map(
    [...cssFiles].filter(([key]) => !key.includes(".dark"))
  );
  return (
    <div {...props}>
      <Page {...pageProps} />
      <Css cssFiles={filtered} />
    </div>
  );
};
```

## Helper Imports

```ts
import { collectViteModuleGraphCss, createCssProps } from "vite-plugin-react-server/helpers";
```
