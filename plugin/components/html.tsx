import React from "react";
import type { CssContent } from "../types.js";
import { CssCollectorElements } from "./css-collector-elements.js";

export function Html({
  CssCollector,
  cssFiles,
  globalCss,
  pageProps,
  Page,
}: {
  CssCollector: React.ComponentType<any>;
  cssFiles: CssContent[];
  globalCss: CssContent[];
  pageProps: any;
  Page: React.ComponentType<any>;
}) {
  return (
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
}
