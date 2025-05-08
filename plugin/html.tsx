import React, { type PropsWithChildren } from "react";
import type { HtmlProps } from "./types.js";
export const Html = ({
  children,
  CssCollector,
  cssFiles,
  moduleBaseURL,
  moduleBasePath,
  moduleRootPath,
}: PropsWithChildren<HtmlProps>) => (
  <html>
    <head>
      <CssCollector
        cssFiles={cssFiles}
        moduleBaseURL={moduleBaseURL}
        moduleBasePath={moduleBasePath}
        moduleRootPath={moduleRootPath}
      />
    </head>
    <body>
      <div id="root">{children}</div>
    </body>
  </html>
);
