import React from "react";
import {
  renderToPipeableStream,
  type PipeableStream,
} from "react-server-dom-esm/server.node";
import { CssCollector } from "../components.js";
import { DEFAULT_CONFIG } from "../options.js";
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
    route,
    url,
    moduleBasePath,
    pipableStreamOptions,
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
        pageProps: props,
        moduleBasePath: moduleBasePath,
        route,
        url,
      },
      React.createElement(Page, { key: "page", ...props }),
      ...css
    ),
    moduleBasePath ?? DEFAULT_CONFIG.MODULE_BASE_PATH,
    {
      onError: logger?.error ?? console.error,
      onPostpone: logger?.info ?? console.info,
      environmentName: "Server",
      ...pipableStreamOptions,
    }
  );
}
