import * as React from "react";
// @ts-ignore
import { renderToPipeableStream } from "react-server-dom-esm/server.node";
import type { PipeableStreamOptions } from "../worker/types.js";
import type { Logger } from "vite";
import type {
  CreateHandlerOptions,
  CssCollectorProps,
  CssContent,
  InlineCssCollectorProps,
} from "../types.js";

export function createRscStream<InlineCSS extends boolean = true>({
  Html,
  Page,
  props,
  loader = (id) => import(id).then((m) => m.default),
  moduleRootPath,
  moduleBasePath,
  moduleBaseURL,
  logger,
  cssFiles = [],
  route,
  url,
  pipableStreamOptions,
  htmlProps,
  inlineCss = true as InlineCSS,
  CssCollector,
  root,
}: {
  Html: CreateHandlerOptions["Html"];
  Page: React.ComponentType<any>;
  loader: (id: string) => Promise<any>;
  props: any;
  moduleBase: string;
  moduleRootPath: string;
  moduleBasePath: string;
  moduleBaseURL: string;
  logger: Logger;
  route: string;
  url: string;
  pipableStreamOptions?: PipeableStreamOptions;
  htmlProps?: any;
  root: string;
  inlineCss?: InlineCSS;
  cssFiles?: (string | CssContent)[];
} & (InlineCSS extends true
  ? {
      CssCollector: React.FC<InlineCssCollectorProps>;
    }
  : {
      CssCollector: React.FC<CssCollectorProps>;
    })) {
  const htmlIsFragment = Html == React.Fragment;
  if (!htmlIsFragment) {
    if (!htmlProps) {
      htmlProps = {};
    }
    if (!("moduleBaseURL" in htmlProps)) {
      htmlProps["moduleBaseURL"] = moduleBaseURL;
    }
    if (!("moduleBasePath" in htmlProps)) {
      htmlProps["moduleBasePath"] = moduleBasePath;
    }
    if (!("moduleRootPath" in htmlProps)) {
      htmlProps["moduleRootPath"] = moduleRootPath;
    }
    if (!("url" in htmlProps)) {
      htmlProps["url"] = url;
    }
    if (!("route" in htmlProps)) {
      htmlProps["route"] = route;
    }
    if (!("pageProps" in htmlProps)) {
      htmlProps["pageProps"] = props;
    }
  }
  console.log(`CssFiles: ${cssFiles}`);
  const withCss = React.createElement(
    CssCollector as any,
    (inlineCss === true
      ? {
          cssFiles: cssFiles,
          route,
          moduleBaseURL,
          moduleBasePath,
          moduleRootPath,
          root,
          loader,
        }
      : { cssFiles: cssFiles, route, moduleBaseURL }) as any,
    React.createElement(Page, props)
  );
  // Otherwise wrap with Html component
  const content = htmlIsFragment
    ? withCss
    : React.createElement(Html, htmlProps, withCss);
  try {
    return renderToPipeableStream(
      content,
      moduleBasePath,
      pipableStreamOptions
    );
  } catch (error) {
    logger.error(`Failed to create stream for ${route}.`, {
      error: error as Error,
    });
    return null;
  }
}
