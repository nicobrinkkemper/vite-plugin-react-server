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
      {/* Without an explicit charset a browser may parse the UTF-8 snapshot
          as windows-1252 — any non-ASCII text ("·", "—") then mismatches the
          client render and hydration fails with React #418. */}
      <meta charSet="utf-8" />
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
