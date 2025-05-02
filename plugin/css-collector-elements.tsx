import React from "react";
import { join } from "node:path";
import type { CssCollectorProps, CssContent } from "./types.js";

// Create link elements for each CSS file
export const CssCollectorElements = ({
  cssFiles,
}: Pick<
  CssCollectorProps,
  "cssFiles"
>) =>
  Array.from(cssFiles?.values() ?? []).map((cssFile: CssContent) => {
    // Emit style tag for inline CSS
    const { as: As, id, children, precedence, ...rest } = cssFile;
    if(As !== "link" && (typeof children === "string" || React.isValidElement(children))) {
      // style tag
      return <As {...rest} key={cssFile.id} >{children}</As>;
    }
    // link tag
    return <As {...rest} key={cssFile.id} precedence={precedence} />;
  });
