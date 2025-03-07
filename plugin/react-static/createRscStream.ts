import * as React from "react";
// @ts-ignore
import { renderToPipeableStream } from "react-server-dom-esm/server.node";
import type { PipeableStreamOptions } from "../worker/types.js";
import type { Logger } from "vite";
import { CssCollector } from "../components.js";

export function createRscStream({
  Html,
  Page,
  props,
  moduleBasePath,
  logger,
  cssFiles = [],
  route,
  url,
  pipableStreamOptions,
  htmlProps,
}: {
  Html: React.ComponentType<any>;
  Page: React.ComponentType<any>;
  props: any;
  moduleBasePath: string;
  logger: Logger;
  cssFiles?: string[];
  route: string;
  url: string;
  pipableStreamOptions?: PipeableStreamOptions;
  htmlProps?: any;
}) {
  const htmlIsFragment = Html == React.Fragment;
  if (!htmlIsFragment) {
    if (!htmlProps) {
      htmlProps = {};
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
  const withCss = React.createElement(
    CssCollector,
    { cssFiles, route },
    React.createElement(Page, props)
  );
  // Otherwise wrap with Html component
  const content = htmlIsFragment
    ? withCss
    : React.createElement(Html, htmlProps, withCss);
  try {
    return renderToPipeableStream(content, moduleBasePath, {
      onError: (error: Error) => {
        if (process.env["NODE_ENV"] === "development") {
          console.trace(error);
        }
        logger.error(`Stream error at ${route}.`, { error });
      },
      onPostpone: logger.info ?? console.info,
      environmentName: "Server",
      ...pipableStreamOptions,
    });
  } catch (error) {
    logger.error(`Failed to create stream for ${route}.`, {
      error: error as Error,
    });
    return null;
  }
}
