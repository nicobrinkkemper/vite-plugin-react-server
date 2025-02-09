import * as React from "react";
// @ts-ignore
import { renderToPipeableStream } from "react-server-dom-esm/server.node";
import { CssCollector } from "../components.js";
import type { RscStreamOptions } from "../types.js";
import type { PipeableStream } from "react-dom/server";

export function createRscStream(
  streamOptions: RscStreamOptions
): PipeableStream {
  const {
    Html,
    Page,
    props,
    logger,
    cssFiles,
    moduleBasePath,
    pipableStreamOptions,
    htmlProps,
  } = streamOptions;

  const css = Array.isArray(cssFiles)
    ? cssFiles.map((css, index) =>
        React.createElement(CssCollector, {
          key: `css-${index}`,
          url: css,
        })
      )
    : [];
  return renderToPipeableStream(
    React.createElement(
      Html,
      {
        key: "html",
        ...htmlProps
      },
      React.createElement(Page, { key: "page", ...props }),
      ...css
    ),
    moduleBasePath,
    {
      onError: logger?.error ?? console.error,
      onPostpone: logger?.info ?? console.info,
      environmentName: "Server",
      ...pipableStreamOptions
    }
  );
}
