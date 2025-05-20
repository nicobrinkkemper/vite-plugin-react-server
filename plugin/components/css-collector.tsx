import React from "react";
import type { CssCollectorProps } from "../types.js";
import { CssCollectorElements } from "./css-collector-elements.js";

/**
 * A component that emits <link> tags for CSS files during streaming.
 * The high precedence ensures they bubble up to the document head.
 */
export const CssCollector = <
  T = unknown,
  InlineCSS extends boolean | undefined = undefined,
  As extends keyof React.JSX.IntrinsicElements | undefined = undefined
>({
  as,
  children,
  cssFiles,
  pageProps,
  ...props
}: CssCollectorProps<T, InlineCSS, As>) => {
  const Component = (as ?? React.Fragment) as React.ElementType;
  return (
    <Component {...props}>
      {children}
      <CssCollectorElements cssFiles={cssFiles ?? new Map()} />
    </Component>
  );
};
