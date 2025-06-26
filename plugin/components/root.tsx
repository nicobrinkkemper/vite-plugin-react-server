import React from "react";
import type { RootComponentType } from "../types.js";
import { Css } from "./css.js";

/**
 * A upgraded Root component that adds the cssFiles to the bottom of the page,,
 * expecting links to bubble up to the document head.
 */
export const Root: RootComponentType = ({
  as: As = React.Fragment,
  cssFiles,
  pageProps = {},
  Page,
  ...props
}) => (
  <As {...(As != React.Fragment ? props : null)}>
    <Page {...pageProps} />
    <Css cssFiles={cssFiles!} />
  </As>
);
