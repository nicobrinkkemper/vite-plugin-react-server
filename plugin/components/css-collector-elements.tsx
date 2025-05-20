import React from "react";
import type { CssContent } from "../types.js";

// Create link elements for each CSS file
export const CssCollectorElements = ({
  cssFiles,
}: {
  cssFiles: Map<string, CssContent> | CssContent[];
}) => {
  if (!cssFiles) return null;
  const cssFilesArray = Array.isArray(cssFiles)
    ? cssFiles
    : Array.from(cssFiles.values());
  if (!cssFilesArray.length) return null;
  return cssFilesArray.map((cssFile: CssContent) => {
    // Emit style tag for inline CSS
    const { as: As, id, children, precedence, type, ...rest } = cssFile;
    if (
      As !== "link" &&
      (typeof children === "string" || React.isValidElement(children))
    ) {
      // style tag
      // since we can't bubble up the style tags, we need to be creative
      return (
        <As {...rest} type={type ?? "text/css"} key={cssFile.id}>
          {children}
        </As>
      );
    }
    // link tag
    return <As {...rest} key={cssFile.id} precedence={precedence} />;
  });
};
