import React from "react";
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
    const { as: As, id, children, precedence, type, ...rest } = cssFile;
    if(As !== "link" && (typeof children === "string" || React.isValidElement(children))) {
      // style tag
      // since we can't bubble up the style tags, we need to be creative
      return <As {...rest} type={type ?? "text/css"} key={cssFile.id}>{children}</As>;
    }
    // link tag
    return <As {...rest} key={cssFile.id} precedence={precedence} />;
  });
