import React from "react";
import type { CssContent, ResolvedUserOptions } from "../types.js";
import type { Logger } from "vite";
import { createHtmlProps } from "./createHtmlProps.js";

export async function createUsableStreamContent<
  T extends React.JSX.IntrinsicAttributes & React.JSX.LibraryManagedAttributes<C, any>,
  C extends React.ComponentType<any> = React.ComponentType<any>,
  InlineCSS extends boolean = true
>({
  Html = React.Fragment,
  PageComponent,
  pageProps,
  moduleBase,
  moduleRootPath,
  moduleBasePath,
  moduleBaseURL,
  rscOutputPath,
  htmlOutputPath,
  cssFiles = new Map(),
  route,
  url,
  htmlProps,
  CssCollector,
  projectRoot,
}: Pick<
  ResolvedUserOptions<InlineCSS>,
  | "Html"
  | "moduleBase"
  | "moduleRootPath"
  | "moduleBasePath"
  | "moduleBaseURL"
  | "pipeableStreamOptions"
  | "CssCollector"
  | "projectRoot"
> & {
  PageComponent: C;
  pageProps: T;
  logger?: Logger;
  route: string;
  rscOutputPath?: string;
  htmlOutputPath?: string;
  url: string;
  htmlProps?: any;
  cssFiles: Map<string, CssContent>;
}) {
  const htmlIsFragment = Html == React.Fragment;
  const cssIsFragment = CssCollector == React.Fragment;

  // Create the page element with the resolved props
  const allProps = createHtmlProps(htmlProps, {
    moduleBase,
    moduleBaseURL,
    moduleBasePath,
    moduleRootPath,
    rscOutputPath,
    htmlOutputPath,
    projectRoot,
    url,
    route,
    pageProps,
    cssFiles,
  });
  if (cssIsFragment && htmlIsFragment) {
    return <PageComponent {...pageProps} />
  }
  if (cssIsFragment && !htmlIsFragment) {
    return (
      <Html {...allProps}>
        <PageComponent {...pageProps} />
      </Html>
    );
  }
  if (!cssIsFragment && htmlIsFragment) {
    return (
      <CssCollector {...allProps}>
        <PageComponent {...pageProps} />
      </CssCollector>
    );
  }
  return (
    <Html {...allProps}>
      <CssCollector {...allProps}>
        <PageComponent {...pageProps} />
      </CssCollector>
    </Html>
  );
}
