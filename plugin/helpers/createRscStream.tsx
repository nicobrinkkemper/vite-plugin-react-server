import React from "react";
import { renderToPipeableStream } from "react-server-dom-esm/server.node";
import type { CreateHandlerOptions, StreamMetrics } from "../types.js";

export function createRscStream<
  T,
  C extends React.ComponentType<T>,
  InlineCSS extends boolean = true
>({
  Html = React.Fragment,
  PageComponent,
  pageProps,
  moduleBase,
  moduleRootPath,
  moduleBasePath,
  moduleBaseURL,
  cssFiles = new Map(),
  route,
  pipeableStreamOptions,
  CssCollector,
  manifest,
  onEvent,
  projectRoot,
}: Pick<
  CreateHandlerOptions<T, C, InlineCSS>,
  | "Html"
  | "PageComponent"
  | "pageProps"
  | "moduleBase"
  | "moduleRootPath"
  | "moduleBasePath"
  | "moduleBaseURL"
  | "rscOutputPath"
  | "htmlOutputPath"
  | "cssFiles"
  | "route"
  | "pipeableStreamOptions"
  | "CssCollector"
  | "manifest"
  | "projectRoot"
> & {
  onEvent?: (event: "error" | "postpone", data: any) => void;
}):
  | { type: "success"; stream: any; metrics: StreamMetrics }
  | { type: "error"; error: Error; metrics: StreamMetrics } {
  const htmlIsFragment = Html == React.Fragment;
  if (!PageComponent) {
    return {
      type: "error",
      error: new Error("PageComponent is required"),
      metrics: {
        chunks: 0,
        bytes: 0,
        backpressureCount: 0,
        drainCount: 0,
        errorCount: 0,
        duration: 0,
        startTime: 0,
      },
    };
  }
  const url =
    moduleBaseURL !== "" ? new URL(route, moduleBaseURL).toString() : route;
  // Create the page element with the resolved props

  // Otherwise wrap with Html component
  const content = htmlIsFragment ? (
    <>
      <PageComponent {...(pageProps as any)} />
      <CssCollector
        as={"head"}
        cssFiles={cssFiles}
        moduleBaseURL={moduleBaseURL}
        moduleBasePath={moduleBasePath}
        moduleRootPath={moduleRootPath}
      />
    </>
  ) : (
    <Html
      moduleBase={moduleBase}
      moduleBaseURL={moduleBaseURL}
      moduleBasePath={moduleBasePath}
      moduleRootPath={moduleRootPath}
      projectRoot={projectRoot}
      url={url}
      route={route}
      pageProps={pageProps}
      cssFiles={cssFiles}
      CssCollector={CssCollector}
      manifest={manifest}
    >
      <PageComponent {...(pageProps as any)} />
    </Html>
  );

  const startTime = Date.now();
  let errorCount = 0;
  let streamError: Error | null = null;
  const Shell: React.FC = () => content as any;
  try {
    const stream = renderToPipeableStream(<Shell />, moduleBasePath, {
      ...pipeableStreamOptions,
      importMap: {
        imports: {
          react: "react/index.js",
          "react-dom": "react-dom/index.js",
        },
      },
      onError(error: Error, errorInfo: any) {
        const err = error instanceof Error ? error : new Error(String(error));
        streamError = err;
        onEvent?.("error", { route, error: err, errorInfo });
        errorCount++;
      },
      onPostpone(reason: string) {
        onEvent?.("postpone", { route, reason });
      },
    });

    // If we have a stream error, return it immediately
    if (streamError) {
      return {
        type: "error",
        error: streamError,
        metrics: {
          chunks: 0,
          bytes: 0,
          backpressureCount: 0,
          drainCount: 0,
          errorCount,
          duration: Date.now() - startTime,
          startTime: startTime,
        },
      };
    }

    return {
      type: "success",
      stream,
      metrics: {
        chunks: 0,
        bytes: 0,
        backpressureCount: 0,
        drainCount: 0,
        errorCount,
        duration: Date.now() - startTime,
        startTime: startTime,
      },
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    onEvent?.("error", { route, error: err });
    return {
      type: "error",
      error: err,
      metrics: {
        chunks: 0,
        bytes: 0,
        backpressureCount: 0,
        drainCount: 0,
        errorCount: errorCount + 1,
        duration: Date.now() - startTime,
        startTime: startTime,
      },
    };
  }
}
