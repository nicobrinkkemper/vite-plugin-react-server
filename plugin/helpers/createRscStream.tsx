import { React, ReactDOMServer } from "../vendor.server.js";
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
  const startTime = Date.now();
  const htmlIsFragment = Html == React.Fragment;
  const url =
    moduleBaseURL !== "" ? new URL(route, moduleBaseURL).toString() : route;
  let errorCount = 0;
  let streamError: Error | null = null;

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
  const elements = htmlIsFragment ? (
    <CssCollector
      cssFiles={cssFiles}
      moduleBaseURL={moduleBaseURL}
      moduleBasePath={moduleBasePath}
      moduleRootPath={moduleRootPath}
    >
      <PageComponent {...(pageProps as any)} />
    </CssCollector>
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
  try {
    const stream = ReactDOMServer.renderToPipeableStream(
      elements,
      moduleBasePath,
      {
        ...pipeableStreamOptions,
        onError(error: Error, errorInfo: any) {
          const err = error instanceof Error ? error : new Error(String(error));
          streamError = err;
          onEvent?.("error", { route, error: err, errorInfo });
          errorCount++;
        },
        onPostpone(reason: string) {
          onEvent?.("postpone", { route, reason });
        },
      }
    );

    // If we have a stream error, return it immediately
    if (streamError) {
      console.error("streamError", streamError);
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
