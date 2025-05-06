import React from "react";
import { renderToPipeableStream } from "react-server-dom-esm/server.node";
import type {
  CssContent,
  ResolvedUserOptions,
  StreamMetrics,
} from "../types.js";
import type { PipeableStream } from "react-dom/server";
import type { Logger } from "vite";
import { createHtmlProps } from "./createHtmlProps.js";

export function createRscStream<T, C extends React.ComponentType<T>, InlineCSS extends boolean = true>({
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
  rscOutputPath?: string;
  htmlOutputPath?: string;
  url: string;
  htmlProps?: any;
  cssFiles: Map<string, CssContent>;
  onEvent?: (event: 'error' | 'postpone', data: any) => void;
}): { type: 'success', stream: PipeableStream; metrics: StreamMetrics } | { type: 'error', error: Error, metrics: StreamMetrics } {
  const htmlIsFragment = Html == React.Fragment;

  // Create the page element with the resolved props
  const pageElement = <PageComponent {...pageProps as any} />;
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
  const withCss = React.createElement(
    CssCollector as any,
    allProps,
    pageElement
  );
  // Otherwise wrap with Html component
  const content = htmlIsFragment
    ? withCss
    : <Html {...allProps}>{withCss}</Html>;

  const startTime = Date.now();
  let errorCount = 0;
  try {
    const stream = renderToPipeableStream(
      content,
      moduleBasePath,
      {
        ...pipeableStreamOptions,
        importMap: {
          imports: {
            "react": "react/index.js",
            "react-dom": "react-dom/index.js",
          },
        },
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
