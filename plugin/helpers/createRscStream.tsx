import { React, ReactDOMServer } from "../vendor/vendor.server.js";
import type {
  CreateHandlerOptions,
  StreamMetrics,
  PagePropOpt,
} from "../types.js";
import { performance } from "node:perf_hooks";

export function createRscStream<T extends PagePropOpt = PagePropOpt>({
  Html = React.Fragment,
  PageComponent,
  pageProps,
  moduleBase,
  moduleRootPath,
  moduleBasePath,
  moduleBaseURL,
  cssFiles = new Map(),
  globalCss = new Map(),
  route,
  pipeableStreamOptions,
  CssCollector,
  manifest,
  onEvent,
  projectRoot,
}: Pick<
  CreateHandlerOptions<T>,
  | "Html"
  | "PageComponent"
  | "pageProps"
  | "moduleBase"
  | "moduleRootPath"
  | "moduleBasePath"
  | "moduleBaseURL"
  | "cssFiles"
  | "route"
  | "pipeableStreamOptions"
  | "CssCollector"
  | "globalCss"
  | "manifest"
  | "projectRoot"
> & {
  onEvent?: (event: "error" | "postpone", data: any) => void;
}):
  | { type: "success"; stream: any; metrics: StreamMetrics }
  | { type: "error"; error: Error; metrics: StreamMetrics } {
  let errorCount = 0;
  let streamError: Error | null = null;
  const startTime = performance.now();
  try {
    const htmlIsFragment = Html === React.Fragment;
    const url = route.startsWith(moduleBaseURL) ? route : moduleBaseURL + route;

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
        key={route}
        as={React.Fragment}
        cssFiles={cssFiles}
        pageProps={pageProps}
        Page={PageComponent}
      />
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
        globalCss={globalCss}
        CssCollector={CssCollector}
        manifest={manifest}
        Page={PageComponent}
        as={"div"}
      />
    );
    const stream = ReactDOMServer.renderToPipeableStream(
      elements,
      moduleBasePath,
      {
        ...pipeableStreamOptions,
        moduleBaseURL: moduleBaseURL,
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
