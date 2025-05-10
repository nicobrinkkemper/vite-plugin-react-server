import React from "react";
import type { HtmlProps } from "./types.js";
export const Html = ({
  children,
  CssCollector,
  cssFiles,
}: React.PropsWithChildren<HtmlProps>) => (
  <html>
    <body>
      <CssCollector
        as={"div"}
        id="root"
        cssFiles={cssFiles}
      >
        {children}
      </CssCollector>
    </body>
  </html>
);
