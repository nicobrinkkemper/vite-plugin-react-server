import { DEFAULT_CONFIG } from "../config/defaults.js";
import { routeToURL } from "../utils/routeToURL.js";
import { createElementWithReact } from "./createElementWithReact.js";
import { React, ReactDOMServer } from "../vendor/vendor.server.js";
import type { CreateHandlerFn } from "./createHandler.types.js";
import { join } from "node:path";
import { assertReactServer } from "../config/getCondition.js";

assertReactServer()

/**
 * Setup rsc handler under server conditions, using direct renderToPipeableStream.
 * @param handlerOptions
 * @returns
 */
export const createHandler: CreateHandlerFn<"server"> =
  function _createHandlerServer(handlerOptions) {
    if (handlerOptions.verbose) {
      handlerOptions.logger?.info(
        `[createHandler.server] Starting handler creation for route: ${handlerOptions.route}`
      );
    }

    const url =
      handlerOptions.url ||
      routeToURL(
        handlerOptions.route,
        handlerOptions.moduleBaseURL || DEFAULT_CONFIG.MODULE_BASE_URL,
        handlerOptions.build?.rscOutputPath ??
          DEFAULT_CONFIG.BUILD.rscOutputPath
      );

    if (handlerOptions.verbose) {
      handlerOptions.logger?.info(
        `[createHandler.server] URL resolved: ${url}`
      );
    }

    const mergedOptions = Object.assign({ url }, handlerOptions);

    // Add onEvent handler to handle errors and log them
    const options = {
      ...mergedOptions,
      onEvent: (event: any) => {
        if (event.type === "route.error") {
          // Log the error to the main thread's logger
          handlerOptions.logger?.error(
            `Error: ${event.data.error?.message || "Unknown error"}`,
            {
              error: event.data.error,
              timestamp: false,
              clear: false,
            }
          );
        }
        // Call the original onEvent handler if it exists
        handlerOptions.onEvent?.(event);
      },
    };

    const pipeableStreamOptions = {
      ...handlerOptions.serverPipeableStreamOptions,
      onError(error: unknown, errorInfo?: any) {
        options.onEvent?.({
          type: "route.error",
          data: {
            route: options.route,
            error: error,
            errorInfo: {
              ...errorInfo,
              componentStack: errorInfo?.componentStack,
              digest: errorInfo?.digest,
            },
          },
        });
        if (
          typeof handlerOptions.serverPipeableStreamOptions?.onError ===
          "function"
        ) {
          handlerOptions.serverPipeableStreamOptions.onError(error, errorInfo);
        }
      },
      onShellError(error: unknown) {
        options.onEvent?.({
          type: "route.shellError",
          data: {
            route: options.route,
            error,
          },
        });
        if (
          typeof handlerOptions.serverPipeableStreamOptions?.onShellError ===
          "function"
        ) {
          handlerOptions.serverPipeableStreamOptions.onShellError(error);
        }
      },
      onPostpone(reason: string) {
        options.onEvent?.({
          type: "route.postpone",
          data: {
            route: options.route,
            reason,
          },
        });
        if (
          typeof handlerOptions.serverPipeableStreamOptions?.onPostpone ===
          "function"
        ) {
          handlerOptions.serverPipeableStreamOptions.onPostpone(reason);
        }
      },
      onAllReady() {
        options.onEvent?.({
          type: "route.allReady",
          data: {
            route: options.route,
          },
        });
        if (
          typeof handlerOptions.serverPipeableStreamOptions?.onAllReady ===
          "function"
        ) {
          handlerOptions.serverPipeableStreamOptions.onAllReady();
        }
      },
      onShellReady() {
        options.onEvent?.({
          type: "route.shellReady",
          data: {
            route: options.route,
          },
        });
        if (
          typeof handlerOptions.serverPipeableStreamOptions?.onShellReady ===
          "function"
        ) {
          handlerOptions.serverPipeableStreamOptions.onShellReady();
        }
      },
    };

    const moduleRootPath =
      handlerOptions.moduleRootPath ||
      join(
        handlerOptions.projectRoot || process.cwd(),
        handlerOptions.build?.outDir || DEFAULT_CONFIG.BUILD.outDir,
        handlerOptions.build?.client || DEFAULT_CONFIG.BUILD.server
      );

    // Ensure required components and properties are always defined
    const elementOptions = {
      ...options,
      HtmlComponent: options.HtmlComponent, // Don't fallback to React.Fragment when undefined
      PageComponent: options.PageComponent || null,
      RootComponent: options.RootComponent || null,
      moduleBase: options.moduleBase || DEFAULT_CONFIG.MODULE_BASE,
      moduleRootPath: moduleRootPath,
      moduleBasePath: options.moduleBasePath || DEFAULT_CONFIG.MODULE_BASE_PATH,
      moduleBaseURL: options.moduleBaseURL || DEFAULT_CONFIG.MODULE_BASE_URL,
      cssFiles: options.cssFiles || new Map(),
      globalCss: options.globalCss || new Map(),
      manifest: options.manifest || {},
      projectRoot: options.projectRoot || process.cwd(),
    };
    const element = createElementWithReact(React, elementOptions);
    const result = ReactDOMServer.renderToPipeableStream(
      element,
      options.moduleBasePath ?? DEFAULT_CONFIG.MODULE_BASE_PATH,
      pipeableStreamOptions
    );

    if (handlerOptions.verbose) {
      handlerOptions.logger?.info(
        `[createHandler.server] Result type: ${typeof result}, has pipe: ${typeof result?.pipe}, has abort: ${typeof result?.abort}`
      );
    }

    return {
      type: "server" as const,
      pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => {
        result.pipe(destination);
        return destination;
      },
      abort: (reason?: unknown) => {
        result.abort(new Error(String(reason || "Aborted")));
      },
      stream: result,
      elements: element,
      metrics: result.metrics,
    };
  };
