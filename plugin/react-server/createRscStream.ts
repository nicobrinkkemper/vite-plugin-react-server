if(process.env['NODE_OPTIONS']?.includes('--conditions=react-server')) {
  throw new Error('React Server Components are not supported in this environment. Please use a supported environment.');
}
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
    route,
    url,
    moduleBasePath,
    pipableStreamOptions,
  } = streamOptions;
  console.log("[createRscStream] Creating stream with:", {
    moduleBasePath,
    cssFiles,
    route,
    url,
    pipableStreamOptions
  });
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
      React.Fragment,
      {
        key: "html",
      },
      React.createElement(Page, { key: "page", ...props }),
      ...css
    ),
    moduleBasePath,
    {
      onError: logger?.error ?? console.error,
      onPostpone: logger?.info ?? console.info,
      environmentName: "Server",
    }
  );
}
