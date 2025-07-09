import { React, ReactDOMServer } from "../vendor/vendor.server.js";
import type {
  CreateHandlerOptions,
  StreamMetrics,
  ResolvedUserOptions,
} from "../types.js";
import { performance } from "node:perf_hooks";
import type { PassThrough } from "node:stream";
import type { ErrorInfo } from "react";
import { toError } from "../error/toError.js";

export type CreateRscStreamOptions = Pick<
  CreateHandlerOptions<ResolvedUserOptions>,
  | "HtmlComponent"
  | "PageComponent"
  | "RootComponent"
  | "pageProps"
  | "moduleBase"
  | "moduleRootPath"
  | "moduleBasePath"
  | "moduleBaseURL"
  | "cssFiles"
  | "route"
  | "pipeableStreamOptions"
  | "globalCss"
  | "manifest"
  | "projectRoot"
  | "verbose"
  | "as"
  | "logger"
> & {
  url: string;
  onEvent?: (
    event: "error" | "postpone",
    data: {
      route: string;
      error?: Error | null;
      errorInfo?: {
        componentStack?: string | null;
        digest?: string | null;
      };
      reason?: string | null;
    }
  ) => void;
};

export type CreateRscStreamReturn =
  | { type: "success"; stream: PassThrough; metrics: StreamMetrics }
  | { type: "error"; error: Error; metrics: StreamMetrics };

export type CreateRscStreamFn = <
  Opt extends CreateRscStreamOptions = CreateRscStreamOptions
>(
  options: Opt
) => CreateRscStreamReturn;

export const createRscStream: CreateRscStreamFn = function _createRscStream({
  HtmlComponent,
  PageComponent,
  RootComponent,
  pageProps,
  moduleBase,
  moduleRootPath,
  moduleBasePath,
  moduleBaseURL,
  cssFiles = new Map(),
  globalCss = new Map(),
  route,
  pipeableStreamOptions,
  manifest,
  onEvent,
  projectRoot,
  verbose,
  url,
  as = "div",
  logger,
}) {
  let errorCount = 0;
  let streamError: Error | null = null;
  const startTime = performance.now();
  try {
    const htmlIsFragment = HtmlComponent === React.Fragment;

    if (!PageComponent) {
      return {
        type: "error",
        error: new Error("PageComponent is required"),
        metrics: {
          chunks: 0,
          bytes: 0,
          backpressureCount: 0,
          drainCount: 0,
          errorCount: 1,
          duration: 0,
          startTime: 0,
        },
      };
    }
    if (!RootComponent) {
      return {
        type: "error",
        error: new Error("RootComponent is required"),
        metrics: {
          chunks: 0,
          bytes: 0,
          backpressureCount: 0,
          drainCount: 0,
          errorCount: 1,
          duration: 0,
          startTime: 0,
        },
      };
    }

    const elements = htmlIsFragment ? (
      <RootComponent
        key={route}
        as={React.Fragment}
        cssFiles={cssFiles}
        pageProps={pageProps}
        Page={PageComponent}
      />
    ) : (
      <HtmlComponent
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
        Root={RootComponent}
        manifest={manifest}
        Page={PageComponent}
        as={as}
      />
    );
    const stream = ReactDOMServer.renderToPipeableStream(
      elements,
      moduleBasePath,
      {
        ...pipeableStreamOptions,
        moduleBaseURL: moduleBaseURL,
        onError(error: Error, errorInfo: ErrorInfo) {
          const err = toError(error);
          streamError = err;
          onEvent?.("error", { route, error: err, errorInfo });
          errorCount++;
        },
        onPostpone(reason: string) {
          onEvent?.("postpone", { route, reason });
        },
        onAllReady() {
          // Stream is ready to be consumed
          if (verbose) {
            logger.info(`[react-server] Stream ready for route: ${route}`);
          }
        },
        onShellError(error: Error) {
          const err = toError(error);
          streamError = err;
          onEvent?.("error", { route, error: err });
          errorCount++;
        },
        onShellReady() {
          // Shell is ready, but we still need to wait for onAllReady
          if (verbose) {
            logger.info(`[react-server] Shell ready for route: ${route}`);
          }
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
    const err = toError(error);
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
};
