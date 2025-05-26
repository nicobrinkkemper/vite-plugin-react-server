import React from "react";
import type { HtmlProps } from "../types.js";
import { CssCollectorElements } from "./css-collector-elements.js";

export const Html = ({
  CssCollector,
  cssFiles,
  globalCss,
  pageProps,
  Page,
  as = "div",
}: HtmlProps) => (
  <html>
    <head>
      <CssCollectorElements cssFiles={globalCss} />
    </head>
    <body>
      <CssCollector
        as={as}
        id="root"
        cssFiles={cssFiles}
        pageProps={pageProps}
        Page={Page}
      />
    </body>
  </html>
);
