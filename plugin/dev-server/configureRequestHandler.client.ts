import type { RenderMetrics, RequestHandler, StreamMetrics } from "../types.js";
import { type Worker } from "node:worker_threads";
import { serializedOptions } from "../helpers/serializeUserOptions.js";
import { requestInfo } from "../helpers/requestInfo.js";
import { performance } from "node:perf_hooks";
import { restartWorker } from "./restartWorker.client.js";
import { handleRscStream } from "./handleRscStream.client.js";
import { getRouteFiles } from "../helpers/getRouteFiles.js";
import type { RscWorkerInputMessage } from "../worker/rsc/types.js";

import { handleServerAction } from "./handleServerAction.client.js";
import type { ConfigureWorkerRequestHandlerFn } from "../react-client/types.js";
import { handleError } from "../error/handleError.js";
import { getNodeEnv } from "../config/getNodeEnv.js";
import { setupGlobalErrorHandler, cleanupGlobalErrorHandler } from "../error/setupGlobalErrorHandler.js";
import { pipeToResponse } from "../helpers/pipeToResponse.js";

/**
 * Configures the worker request handler.
 * @param server - The Vite dev server
 * @param autoDiscoveredFiles - The auto discovered files
 * @param userOptions - The user options
 */
export const configureRequestHandler: ConfigureWorkerRequestHandlerFn =
  async function _configureWorkerRequestHandler({
    server,
    autoDiscoveredFiles,
    userOptions: _userOptions,
    hmrChannel,
    onWorkerCreated,
  }) {
    const logger = server.config.customLogger || server.config.logger;
    const {
      // remove these
      projectRoot: _projectRoot,
      moduleBaseURL: _moduleBaseURL,
      ...handlerUserOptions
    } = _userOptions;
    const handlerOptions = Object.assign({}, handlerUserOptions, {
      moduleBaseURL: server.config.base,
      projectRoot: server.config.root,
      logger: logger,
    });

    // Set up global error handler for all_errors panic threshold
    setupGlobalErrorHandler({
      panicThreshold: handlerOptions.panicThreshold,
      logger: logger,
      verbose: handlerOptions.verbose,
    });

    // Start the worker
    let currentWorker: Worker | null = null;

    // Handle server restarts
    server.ws.on("restart", async () => {
      logger.info("[react-client] Server restarting, shutting down worker...");
      if (currentWorker) {
        currentWorker.postMessage({
          type: "SHUTDOWN",
          id: "*",
        } satisfies RscWorkerInputMessage);
        await new Promise((resolve, reject) => {
          currentWorker?.on("message", (message) => {
            if (message.type === "SHUTDOWN_COMPLETE") {
              resolve(true);
            } else {
              reject("Did not receive SHUTDOWN_COMPLETE");
            }
          });
        });
        currentWorker.removeAllListeners();
        currentWorker = null;
      }
      
      // Clean up global error handler
      cleanupGlobalErrorHandler();
    });

    // Create the request handler
    const handler: RequestHandler = async (req, res, next) => {
      if (!req.url) return next();

      const info = requestInfo(req, handlerOptions, "");
      const handlerOptionsWithUrl = {
        ...handlerOptions,
        url: info.url,
      };
      // Serialize user options for worker
      const serializedUserOptions = serializedOptions(
        handlerOptionsWithUrl,
        autoDiscoveredFiles
      );

      // Handle server action requests
      if (info.isServerActionRequest) {
        if (!currentWorker) {
          currentWorker = await restartWorker({
            server,
            autoDiscoveredFiles,
            userOptions: serializedUserOptions,
            hmrChannel,
          });
        }
        if (!currentWorker) {
          throw new Error("Failed to start worker");
        }
        return handleServerAction(req, res, currentWorker, logger);
      }

      // Handle RSC requests
      if (!info.isRscRequest) {
        return next();
      }

      const routeFiles = await getRouteFiles(
        info.route,
        autoDiscoveredFiles,
        handlerOptions,
        logger
      );
      if (routeFiles.type === "error") {
        const   panicError = handleError({
          error: routeFiles.error,
          logger,
          mode: getNodeEnv(server.config.mode),
          panicThreshold: handlerOptions.panicThreshold,
          critical: false,
          context: "configureWorkerRequestHandler",
        });
        if (panicError != null) {
          throw panicError;
        }
        return next(routeFiles.error);
      }
      const pagePath = routeFiles.page;
      const propsPath = routeFiles.props;
      const rootPath = routeFiles.root;
      const htmlPath = routeFiles.html;
      try {
        // Set up response headers for streaming
        res.setHeader("Content-Type", info.contentType);
        res.setHeader("Transfer-Encoding", "chunked");
        res.setHeader("Connection", "keep-alive");

        const userOnMetrics =
          typeof handlerOptions.onMetrics === "function"
            ? (metrics: StreamMetrics) => {
                const elapsedTime = performance.now() - startTime;
                const formattedMetrics = {
                  route: info.route,
                  htmlSize: 0,
                  rscSize: metrics.bytes,
                  processingTime: elapsedTime,
                  chunks: metrics.chunks,
                  chunkRate: metrics.chunks / (elapsedTime / 1000),
                  memoryUsage: process.memoryUsage(),
                  streamMetrics: {
                    ...metrics,
                    duration: elapsedTime,
                  },
                  htmlSizes: new Map(),
                  rscSizes: new Map([[info.route, metrics.bytes]]),
                } satisfies RenderMetrics;
                if(typeof handlerOptions.onMetrics === 'function') {
                  handlerOptions.onMetrics(formattedMetrics);
                }
              }
            : () => {};
        const startTime = performance.now();
        if (!currentWorker) {
          currentWorker = await restartWorker({
            server,
            autoDiscoveredFiles,
            userOptions: serializedUserOptions,
            hmrChannel,
          });
        } else {
          // Worker already exists, reuse it
          // Note: createWorkerStream handles its own listeners
        }
        if (!currentWorker) {
          throw new Error("Failed to start worker");
        }
        // Notify about worker creation
        onWorkerCreated?.(currentWorker);
        const stream = handleRscStream({
          worker: currentWorker,
          message: {
            ...serializedUserOptions,
            id: info.route,
            type: "RSC_RENDER",
            // we make the worker stream aware of the route, pagePath, propsPath, rootPath, htmlPath
            route: info.route,
            url: info.url,
            pagePath: pagePath,
            propsPath: propsPath,
            rootPath: rootPath,
            htmlPath: htmlPath,
            // Component overrides (undefined for file-based components in dev)
            HtmlComponent: undefined,
            RootComponent: undefined,
            // override these at all times to ensure the settings will work for the dev server
            projectRoot: server.config.root,
            build: {
              ...(serializedUserOptions.build || {}),
              pages: Array.isArray(serializedUserOptions.build?.pages)
                ? serializedUserOptions.build.pages
                : [],
            },
            manifest: autoDiscoveredFiles.staticManifest,
            cssFiles: new Map(),
            globalCss: new Map(),
            serverPipeableStreamOptions: serializedUserOptions.serverPipeableStreamOptions,
            clientPipeableStreamOptions: serializedUserOptions.clientPipeableStreamOptions,
          },
          handlers: {
            onMetrics: (id, metrics) => {
              metrics.route = id;
              userOnMetrics(metrics);
            },
            onHmrAccept: () => {
              // TODO: implement HMR accept handler
            },
            onHmrUpdate: () => {
              // TODO: implement HMR update handler
            },
            onShellError: (_id, _error) => {
              // TODO: implement shell error handler
            },
          },
          ...handlerOptions,
        });

        // Pipe the stream to the response using the helper
        pipeToResponse({
          stream,
          response: res,
          contentType: info.contentType,
          logger,
          verbose: handlerOptions.verbose,
          panicThreshold: handlerOptions.panicThreshold,
          context: "configureWorkerRequestHandler",
        });
        // wait for timeout
      } catch (error) {
        const panicError = handleError({
          error,
          logger,
          mode: getNodeEnv(server.config.mode),
          panicThreshold: handlerOptions.panicThreshold,
          critical: false,
          context: "configureWorkerRequestHandler",
        });
        if (panicError != null) {
          throw panicError;
        }
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "text/x-component; charset=utf-8");
        }
        res.end();
      }
      let timeout: NodeJS.Timeout;
      try {
        await new Promise((reject) => {
          timeout = setTimeout(() => {
            clearTimeout(timeout);
            reject(new Error("RSC Render timeout"));
          }, handlerOptions.rscTimeout);
        });
      } catch {
        if (currentWorker) {
          currentWorker.postMessage({
            type: "SHUTDOWN",
            id: "*",
          } satisfies RscWorkerInputMessage);
          await new Promise((resolve, reject) => {
            currentWorker?.on("message", (message) => {
              if (message.type === "SHUTDOWN_COMPLETE") {
                resolve(true);
              } else {
                reject("Did not receive SHUTDOWN_COMPLETE");
              }
            });
          });
          currentWorker.removeAllListeners();
        }
        logger.error("RSC render timeout.");
        clearTimeout(timeout!);
        res.end();
      }
    };
    // attach handler to the server
    server.middlewares.use(handler);
    // port check, should be handled by strictPort
  };
