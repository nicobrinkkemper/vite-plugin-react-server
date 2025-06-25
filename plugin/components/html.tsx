import React from "react";
import type { HtmlProps } from "../types.js";
import { Css } from "./css.js";

export const Html = ({
  Root,
  cssFiles,
  globalCss,
  pageProps,
  Page,
  as = "div",
}: HtmlProps) => (
  <html>
    <head>
      <Css cssFiles={globalCss} />
    </head>
    <body>
      <Root
        as={as}
        id="root"
        cssFiles={cssFiles}
        pageProps={pageProps}
        Page={Page}
      />
    </body>
  </html>
);
