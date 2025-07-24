import { React, ReactDOMServer } from "../vendor/vendor.server.js";
import type {
  CreateHandlerOptions,
  StreamMetrics,
  ResolvedUserOptions,
} from "../types.js";
import { performance } from "node:perf_hooks";
import { handleError } from "../error/handleError.js";
import { PassThrough } from "node:stream";
import { createLogger } from "vite";

export type CreateRscStreamOptions = Pick<
  CreateHandlerOptions<ResolvedUserOptions>,
  | "url"
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
  | "panicThreshold"
  | "onEvent"
>;

export type CreateRscStreamReturn =
  | {
      type: "success";
      controller: { abort: (reason: unknown) => void; destroy: () => void };
      metrics: StreamMetrics;
    }
  | { type: "error"; error: unknown | null; metrics: StreamMetrics };

export type CreateRscStreamFn = <
  Opt extends CreateRscStreamOptions = CreateRscStreamOptions,
  Stream extends NodeJS.WritableStream | PassThrough = PassThrough
>(
  options: Opt,
  passThrough: Stream
) => CreateRscStreamReturn & { stream: Stream };

export const createRscStream: CreateRscStreamFn = function _createRscStream(
  {
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
    logger = createLogger(),
    panicThreshold,
  },
  passThrough = new PassThrough() as never
) {
  let errorCount = 0;
  const startTime = performance.now();

  try {
    const htmlIsFragment = HtmlComponent === React.Fragment;

    if (!PageComponent) {
      return {
        type: "error",
        stream: passThrough,
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
      } satisfies CreateRscStreamReturn & { stream: typeof passThrough };
    }
    if (!RootComponent) {
      return {
        type: "error",
        error: new Error("RootComponent is required"),
        stream: passThrough,
        metrics: {
          chunks: 0,
          bytes: 0,
          backpressureCount: 0,
          drainCount: 0,
          errorCount: 1,
          duration: 0,
          startTime: 0,
        },
      } satisfies CreateRscStreamReturn & { stream: typeof passThrough };
    }

    let reactStream;
    try {
      reactStream = ReactDOMServer.renderToPipeableStream(
        htmlIsFragment ? (
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
        ),
        moduleBasePath,
        {
          ...pipeableStreamOptions,
          onError(error: Error, errorInfo?: any) {
            errorCount++;
            const loggedError = handleError({
              error: error,
              logger: logger,
              panicThreshold: panicThreshold,
              errorInfo: errorInfo,
              context: `createRscStream(${route})`,
            }) ?? error
            // if the onEvent function is defined, create the object and pass it to the onEvent function
            onEvent?.({
              type: "route.error",
              data: {
                route,
                error: loggedError,
                errorInfo: {
                  componentStack: errorInfo?.componentStack,
                  digest: errorInfo?.digest,
                },
              },
            });
          },
          onPostpone(reason: string) {
            onEvent?.({
              type: "route.postpone",
              data: {
                route,
                reason,
              },
            });
          },
          onAllReady() {
            // Stream is ready to be consumed
            if (verbose) {
              logger.info(`[react-server] Stream ready for route: ${route}`);
            }
          },
          onShellReady() {
            // Shell is ready, but we still need to wait for onAllReady
            if (verbose) {
              logger.info(`[react-server] Shell ready for route: ${route}`);
            }
          },
        }
      );
    } catch (renderError) {
      // Handle synchronous errors that occur during renderToPipeableStream setup

      return {
        type: "error",
        error: handleError({
          error: renderError as Error,
          critical: false,
          logger: logger,
          panicThreshold: panicThreshold,
          context: `createRscStream(${route})`,
        }) ?? renderError,
        stream: passThrough,
        metrics: {
          chunks: 0,
          bytes: 0,
          backpressureCount: 0,
          drainCount: 0,
          errorCount,
          duration: Date.now() - startTime,
          startTime,
        },
      } satisfies CreateRscStreamReturn & { stream: typeof passThrough };
    }
    // Pipe React stream directly to PassThrough
    // We'll handle the malformed chunk issue by preventing the root cause
    reactStream.pipe(passThrough);

    const controller = {
      abort: (reason: unknown) => {
        // First, try to abort the React stream with the proper error
        try {
          reactStream.abort(reason ?? "stream aborted");
        } catch (abortError) {
          if (verbose) {
            logger.warn(
              `[react-server] React stream abort failed: ${abortError}`
            );
          }
        }
      },
      destroy: () => {
        // For destroy, send a proper error and then destroy the stream
        try {
          reactStream.abort("destroyed");
        } catch {}
      },
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
    } satisfies CreateRscStreamReturn & { stream: typeof passThrough };
  } catch (error) {
    const panicError = handleError({
      error: error,
      critical: false,
      logger: logger,
      panicThreshold: panicThreshold,
      context: `React RSC Stream Error (${route})`,
    });
    if (panicError != null) {
      onEvent?.({
        type: "route.error",
        data: {
          route,
          error: panicError,
        },
      });
    }
    return {
      type: "error",
      error: panicError,
      stream: passThrough,
      metrics: {
        chunks: 0,
        bytes: 0,
        backpressureCount: 0,
        drainCount: 0,
        errorCount: errorCount + 1,
        duration: Date.now() - startTime,
        startTime: startTime,
      },
    } satisfies CreateRscStreamReturn & { stream: typeof passThrough };
  }
};
