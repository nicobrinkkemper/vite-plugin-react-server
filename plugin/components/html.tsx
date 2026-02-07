import type { HtmlComponentType, HtmlProps } from "../types.js";
import { Css } from "./css.js";
import React from 'react'


export const Html: HtmlComponentType<any, any, any, any> = ({
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
