import React from "react";
import type {
  AsOpt,
  CssCollectorType,
  InlineCssOpt,
  PagePropOpt,
} from "../types.js";
import { CssCollectorElements } from "./css-collector-elements.js";

/**
 * A upgraded Root component that adds the cssFiles to the bottom of the page,,
 * expecting links to bubble up to the document head.
 */
export const CssCollector: CssCollectorType<
  PagePropOpt,
  InlineCssOpt,
  AsOpt
> = ({
  as: As = React.Fragment,
  children: _,
  cssFiles,
  pageProps,
  Page,
  ...props
}) => (
  <As {...(As !== React.Fragment ? props : null)}>
    <Page {...pageProps!} />
    <CssCollectorElements cssFiles={cssFiles!} />
  </As>
);
