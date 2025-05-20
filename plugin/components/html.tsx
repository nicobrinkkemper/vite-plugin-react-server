import React from "react";
import type { HtmlProps } from "../types.js";
import { CssCollectorElements } from "./css-collector-elements.js";
export const Html = <
  T = unknown,
  InlineCSS extends boolean | undefined = undefined
>({
  children,
  CssCollector,
  cssFiles,
  globalCss,
  pageProps,
}: React.PropsWithChildren<HtmlProps<T, InlineCSS>>) => (
  <html>
    <head>
      <CssCollectorElements cssFiles={globalCss} />
    </head>
    <body>
      <CssCollector as="div" id="root" cssFiles={cssFiles} pageProps={pageProps}>
        {children}
      </CssCollector>
    </body>
  </html>
);
