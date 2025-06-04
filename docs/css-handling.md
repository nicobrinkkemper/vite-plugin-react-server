# CSS Handling in RSC Static Site Generator

This document explains how CSS is handled in the React Server Components (RSC) static site generator.

## Key Features

The CSS handling system provides three main features that can be used independently or in combination:

1. **User-defined CssCollector**: 
   -  **CssCollector: `(props)=><link href="my-file"/>`**
2. **Alters the props for the CssCollector**
   - **css.inlineCss**: Feature flag to disable inlining css completely
   - **css.inlineThreshold**: Size in bytes (number)
   - **inlinePatterns**: optional regex to force a `<style>` tag
   - **linkPatterns**: optional regex to force a `<link>` tag


## Default Configuration

```typescript
{
  CSS_COLLECTOR: CssCollector,
  CSS: {
    inlineCss: false,
    purgeCss: false, // not supported yet, for future reference
    inlineThreshold: 4096, // 4KB
    inlinePatterns: [/\.module\.css$/], // Always inline CSS modules
    linkPatterns: [/node_modules/], // Always link node_modules CSS
  }
}
```

## User-defined CssCollector

### Props Interface

The props your custom collector receives depend on the imported css for each page & prop file combination.

```typescript
import styles from './styles.module.css';
export const Page = () => {
 return <div className={styles.userClass}>Hello World</div>
}
```  
then the module will basically contain whatever `styles` exported here. But how does it track css class usages
during streaming?
```ts
const links = Array.from(cssFiles.values()).map(cssFile => <link rel="stylesheet" href={cssFile.path} />)
```
The types for cssFiles is an array of either CssProps and or InlineCssProps.
```ts
type BaseCssProps = {
  as: string;
  id: string;
};

type CssProps = BaseCssProps & {
  as: "link";
  type?: never;
  children?: InlineCssProps extends false ? never : React.ReactNode;
  id: string;
  href: string;
  rel: "stylesheet";
  precedence?: string;
};
type InlineCssProps = BaseCssProps & {
  as: "style";
  type: "text/css";
  children?: React.ReactNode;
  precedence?: never;
  rel?: never;
  href?: never;
};
```

### Basic Implementation

```typescript
function MyCustomCssCollector(props: CssCollectorProps) {
  // Check if we're in inline mode
  const isInlineMode = 'content' in props.cssFiles[0];
  
  return (
    <>
      {props.cssFiles.map(cssFile => 
        cssFile.as === 'style' ? (
          <style key={cssFile.id} type={cssFile.type}>{cssFile.code}</style>
        ) : (
          <link key={cssFile.id} rel="stylesheet" href={cssFile.href} />
        )
      )}
      {props.children}
    </>
  );
}
```


### Configuration Options

- **inlinePatterns**: Files matching these patterns are always inlined
- **linkPatterns**: Files matching these patterns are always linked

### About inlineThreshold

The `inlineThreshold` feature will allow you to control which CSS files get inlined based on their size:

- Files smaller than the threshold (in bytes) will be inlined
- Files larger than the threshold will be linked instead

This is useful for optimizing performance by:
- Inlining small CSS files to reduce HTTP requests
- Avoiding inlining large CSS files that would bloat the HTML document

## Purging css

By adding our own own CssCollector, we can have one final say over the cssFiles that we render. We could filter out some of the css files however we wish. Even though it's called a CssCollector, it's essentially your very own Root component and as such can be designed as a Root component.

Here's an example on how to 

```tsx
import React, { type Fragment } from "react";
import { CssCollectorElements } from "vite-plugin-react-server/components";
import type { CssCollectorProps } from "vite-plugin-react-server/types";
import { themes } from "./config/themeConfig.js";

// imagine semi-structured paths to css
const removeableCSS = [
  "/src/css/4ymm.module.css",
  // but one exception
  "/src/css/5-6ymm.module.css",
  "/src/css/7mmc.module.css",
  "/src/css/8mmc.module.css",
  "/src/css/9mmc.module.css",
];

const createFilter = (theme: Theme) => {
  // handle exception
  if (theme === "5ymm" || theme === "6ymm") {
    return [theme, removeableCSS.filter((css) => css.includes("5-6ymm"))];
  }
  // should not include any of the following
  return [theme, removeableCSS.filter((css) => css.includes(theme))];
};

// a map of filters
const filters = Object.fromEntries(themes.map(createFilter)) as {
  [key in Theme]: string[];
};


export const MmcCssCollector = ({
  as: Component,
  cssFiles,
  pageProps,
  Page,
  ...props
}: CssCollectorProps<
  {
    pathInfo: { theme: Theme };
  },
  boolean,
  "div" | typeof Fragment
>) => {
  if (!cssFiles) return null;
  if (!pageProps || !("pathInfo" in pageProps)) return null;
  const theme = pageProps.pathInfo.theme;
  const cssArray = Array.isArray(cssFiles)
    ? cssFiles
    : Array.from(cssFiles?.values() ?? []);
  const removeNonCurrentThemeCss = new Map(
    cssArray
      .filter(
        // remove any file that is "removeable" and does not include our id
        (file) =>
          !removeableCSS.includes(file.id) || filters[theme].includes(file.id)
      )
      .map((file) => [file.id, file])
  );
  // decide when and where to render the Wrapper, Page, CssCollector at the last moment
  // which can be used during "react-server" dev mode and in static html/rsc files
  return (
    <Component {...props}>
      <Page {...pageProps} />
      <CssCollectorElements cssFiles={removeNonCurrentThemeCss} />
    </Component>
  );
};

```

By moving this logic to the CssCollector itself, we can test out the behavior in development using the react-server condition. We can run a build and then run the preview server to verify that the css is correctly omitted from the static index.html and index.rsc streams.
