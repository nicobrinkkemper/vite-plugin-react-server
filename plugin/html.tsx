import React from "react";
import type { HtmlProps } from "./types.js";
import { CssCollectorElements } from "./css-collector-elements.js";
export const Html = ({
  children,
  CssCollector,
  cssFiles,
  globalCss,
  moduleBasePath,
}: React.PropsWithChildren<HtmlProps>) => (
  <html>
    <head>
      {moduleBasePath !== ""}
      <CssCollectorElements cssFiles={globalCss} />
    </head>
    <body>
      <CssCollector as={"div"} id="root" cssFiles={cssFiles}>
        {children}
      </CssCollector>
    </body>
  </html>
);
