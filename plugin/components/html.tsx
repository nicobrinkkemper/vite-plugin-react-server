import React from "react";
import type { HtmlComponentType } from "../types.js";
import { CssCollectorElements } from "./css-collector-elements.js";

export const Html: HtmlComponentType = ({
  children,
  CssCollector,
  cssFiles,
  globalCss,
  pageProps,
  Page,
}) => (
  <html>
    <head>
      <CssCollectorElements cssFiles={globalCss} />
    </head>
    <body>
      <CssCollector
        as="div"
        id="root"
        cssFiles={cssFiles}
        pageProps={pageProps}
        Page={Page}
       />
    </body>
  </html>
);
