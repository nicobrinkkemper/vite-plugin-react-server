import { React, ReactDOMServer } from "../vendor/vendor.server.js";
import type {
  CreateHandlerOptions,
  StreamMetrics,
  ResolvedUserOptions,
} from "../types.js";
import { performance } from "node:perf_hooks";
import type { PassThrough as PassThroughType } from "node:stream";
import type { ErrorInfo } from "react";
import { toError } from "../error/toError.js";
import { logError } from "../error/logError.js";
import { PassThrough } from "node:stream";
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
  | { type: "success"; stream: PassThrough; controller: { abort: () => void; destroy: () => void }; metrics: StreamMetrics }
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
    const reactStream = ReactDOMServer.renderToPipeableStream(
      elements,
      moduleBasePath,
      {
        ...pipeableStreamOptions,
        moduleBaseURL: moduleBaseURL,
        onError(error: Error, errorInfo?: ErrorInfo) {
          const err = toError(error);
          onEvent?.("error", { route, error: err, errorInfo });
          errorCount++;
          // Don't abort here - let React handle the error naturally
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
          logError(err, logger);
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
    const passThrough: PassThroughType = new PassThrough();
    reactStream.pipe(passThrough);
    
    // Ensure the stream is properly handled even when there are errors
    // React will include error entries in the stream when components throw
    const controller = {
      abort: (reason?: any) => reactStream.abort(reason),
      destroy: () => {
        try { reactStream.abort("destroyed"); } catch {}
        try { passThrough.destroy(); } catch {}
      }
    };
    
    return {
      type: "success",
      stream: passThrough,
      controller,
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
