import * as React from "react";
import type { PipeableStream } from "react-dom/server";
// @ts-ignore
import { renderToPipeableStream } from "react-server-dom-esm/server.node";
import { CssCollector } from "../components.js";
import type { RscStreamOptions } from "../types.js";

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
          url: css.startsWith("/") ? css : `/${css}`,
          moduleBasePath,
        })
      )
    : [];
  const htmlIsFragment = Html.type === React.Fragment;
  return renderToPipeableStream(
    React.createElement(
      Html,
      {
        key: "html",
        ...(htmlIsFragment ? {} : htmlProps)
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
