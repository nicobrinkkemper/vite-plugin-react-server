import React from "react";
// @ts-ignore
import { renderToPipeableStream } from "react-server-dom-esm/server.node";
import type {
  CssContent,
  ResolvedUserOptions,
  StreamMetrics,
} from "../types.js";
import type { PipeableStream } from "react-dom/server";
import type { Logger } from "vite";

export function createRscStream<T, C extends React.ComponentType<T>, InlineCSS extends boolean = true>({
  Html = React.Fragment,
  PageComponent,
  pageProps,
  moduleBase,
  moduleRootPath,
  moduleBasePath,
  moduleBaseURL,
  cssFiles = new Map(),
  route,
  url,
  pipeableStreamOptions,
  htmlProps,
  CssCollector,
  onEvent,
  projectRoot,
}: Pick<ResolvedUserOptions<InlineCSS>, "Html" | "moduleBase" | "moduleRootPath" | "moduleBasePath" | "moduleBaseURL" | "pipeableStreamOptions" | "CssCollector" | "projectRoot"> & {
  PageComponent: C;
  pageProps: T;
  logger?: Logger;
  route: string;
  url: string;
  htmlProps?: any;
  cssFiles: Map<string, CssContent>;
  onEvent?: (event: 'error' | 'postpone', data: any) => void;
}): { type: 'success', stream: PipeableStream; metrics: StreamMetrics } | { type: 'error', error: Error, metrics: StreamMetrics } {
  const htmlIsFragment = Html == React.Fragment;
  if (!htmlProps) {
    htmlProps = {};
  }
  if (!("moduleBase" in htmlProps && typeof moduleBase === "string")) {
    htmlProps["moduleBase"] = moduleBase;
  }
  if (!("moduleBaseURL" in htmlProps && typeof moduleBaseURL === "string")) {
    htmlProps["moduleBaseURL"] = moduleBaseURL;
  }
  if (!("moduleBasePath" in htmlProps && typeof moduleBasePath === "string")) {
    htmlProps["moduleBasePath"] = moduleBasePath;
  }
  if (!("moduleRootPath" in htmlProps && typeof moduleRootPath === "string")) {
    htmlProps["moduleRootPath"] = moduleRootPath;
  }
  if (!("projectRoot" in htmlProps && typeof projectRoot === "string")) {
    htmlProps["projectRoot"] = projectRoot;
  }
  if (!("url" in htmlProps && typeof url === "string")) {
    htmlProps["url"] = url;
  }
  if (!("route" in htmlProps && typeof route === "string")) {
    htmlProps["route"] = route;
  }
  if (!("pageProps" in htmlProps && typeof pageProps === "object")) {
    htmlProps["pageProps"] = pageProps;
  }
  if (!("cssFiles" in htmlProps && cssFiles instanceof Map)) {
    htmlProps["cssFiles"] = cssFiles
  }

  // Create the page element with the resolved props
  
  const pageElement = <PageComponent {...pageProps as any} />;

  const withCss = React.createElement(
    CssCollector as any,
    htmlProps,
    pageElement
  );
  // Otherwise wrap with Html component
  const content = htmlIsFragment
    ? withCss
    : React.createElement(Html, htmlProps, withCss);

  const startTime = Date.now();
  let errorCount = 0;
  try {


    const stream = renderToPipeableStream(
      content,
      moduleBasePath,
      {
        ...pipeableStreamOptions,
        onError(error: Error, errorInfo: any) {
          const err = error instanceof Error ? error : new Error(String(error));
          onEvent?.("error", { route, error: err, errorInfo });
          errorCount++;
        },
        onPostpone(reason: string) {
          onEvent?.("postpone", { route, reason });
        },
      }
    );

    return {
      type: 'success',
      stream,
      metrics: {
        chunks: 0,
        bytes: 0,
        backpressureCount: 0,
        drainCount: 0,
        errorCount,
        duration: Date.now() - startTime,
        startTime: startTime
      }
    };
  } catch (error) {
    return {
      type: 'error',
      error: error instanceof Error ? error : new Error(String(error)),
      metrics: {
        chunks: 0,
        bytes: 0,
        backpressureCount: 0,
        drainCount: 0,
        errorCount,
        duration: Date.now() - startTime,
        startTime: startTime
      }
    };
  }
}
