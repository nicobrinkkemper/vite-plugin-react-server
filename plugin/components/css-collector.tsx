import React from "react";
import type { CssCollectorFn } from "../types.js";
import { CssCollectorElements } from "./css-collector-elements.js";

/**
 * A upgraded Root component that adds the cssFiles to the bottom of the page,,
 * expecting links to bubble up to the document head.
 */
export const CssCollector: CssCollectorFn = ({
  as: As = React.Fragment,
  cssFiles,
  pageProps,
  Page,
  ...props
}) => (
  <As
    {...(As != React.Fragment
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (props as any)
      : null)}
  >
    <Page {...pageProps!} />
    <CssCollectorElements cssFiles={cssFiles!} />
  </As>
);
