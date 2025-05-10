import React from "react";
import type { CssCollectorProps } from "./types.js";
import { CssCollectorElements } from "./css-collector-elements.js";

/**
 * A component that emits <link> tags for CSS files during streaming.
 * The high precedence ensures they bubble up to the document head.
 */
export function CssCollector({
  children = null,
  cssFiles = new Map(),
  as: As = React.Fragment,
  ...props
}: Pick<CssCollectorProps, "children" | "cssFiles" | "as">) {
  if (As === React.Fragment) {
    return (
      <>
        {children}
        <CssCollectorElements cssFiles={cssFiles} />
      </>
    );
  }
  return (
    <As {...props}>
      {children}
      <CssCollectorElements cssFiles={cssFiles} />
    </As>
  );
}
