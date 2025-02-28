import * as React from "react";
// @ts-ignore
import { renderToPipeableStream } from "react-server-dom-esm/server.node";
import type { PipeableStreamOptions } from "../worker/types.js";
import type { Logger } from "vite";


// CSS collector component
function CssCollector({
  children,
  cssFiles,
}: {
  children?: React.ReactNode;
  cssFiles: string[];
}) {
  return React.createElement(
    React.Fragment,
    null,
    ...cssFiles.map((css) => {
      const url = css.startsWith('/') || css.startsWith('http') || css.startsWith('./') ? css : '/'+css
      return React.createElement('link', {
        key: css,
        rel: 'stylesheet',
        href: url
      })
    }),
    children
  );
}

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
  const withCss = React.createElement(
    CssCollector,
    { cssFiles },
    React.createElement(Page, props)
  )
  // Otherwise wrap with Html component
  const content = htmlIsFragment 
    ? withCss
    : React.createElement(Html, htmlProps, withCss);
  try {
    return renderToPipeableStream(
      content,
      moduleBasePath,
      {
        onError: (error: Error) => {
          logger.error(`Stream error at ${route}.`, {error});
        },
        onPostpone: logger.info ?? console.info,  
        environmentName: "Server",
        ...pipableStreamOptions,
      }
    );
  } catch (error) {
    logger.error(`Failed to create stream for ${route}.`, {error: error as Error});
    return null;
  }
}
