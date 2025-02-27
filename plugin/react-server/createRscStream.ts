import * as React from "react";
import type ReactDOMServer from "react-dom/server";
// @ts-ignore
import { renderToPipeableStream } from "react-server-dom-esm/server.node";
import type { RscStreamOptions } from "../types.js";

export function createRscStream(
  streamOptions: RscStreamOptions
): ReactDOMServer.PipeableStream {
  const {
    Html,
    Page,
    props,
    logger,
    moduleBasePath,
    pipableStreamOptions,
    htmlProps,
  } = streamOptions;

  const htmlIsFragment = Html == React.Fragment;

  // Otherwise wrap with Html component
  const content = htmlIsFragment 
    ? React.createElement(Page, { ...props })
    : React.createElement(
        Html,
        htmlProps,
        React.createElement(Page, { ...props })
      );

  return renderToPipeableStream(
    content,
    moduleBasePath,
    {
      onError: logger?.error ?? console.error,
      onPostpone: logger?.info ?? console.info,
      environmentName: "Server",
      importMap: {
        imports: {
          ...pipableStreamOptions?.importMap?.imports,
          '/': moduleBasePath
        }
      },
      ...pipableStreamOptions
    }
  );
}
