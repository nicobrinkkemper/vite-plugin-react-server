import type { RenderMetrics, RequestHandler, StreamMetrics } from "../types.js";
import { type Worker } from "node:worker_threads";
import { serializedOptions } from "../helpers/serializeUserOptions.js";
import { requestInfo } from "../helpers/requestInfo.js";
import { performance } from "node:perf_hooks";
import { restartWorker } from "./restartWorker.js";
import { handleWorkerRscStream } from "./handleWorkerRscStream.js";
import { getRouteFiles } from "../helpers/getRouteFiles.js";
import type { RscWorkerInputMessage } from "../worker/rsc/types.js";
import { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import { handleWorkerServerAction } from "./handleWorkerServerAction.js";
import { logError } from "../error/logError.js";
import type { ConfigureWorkerRequestHandlerFn } from "./types.js";

/**
 * Configures the worker request handler.
 * @param server - The Vite dev server
 * @param autoDiscoveredFiles - The auto discovered files
 * @param userOptions - The user options
 */
export const configureWorkerRequestHandler: ConfigureWorkerRequestHandlerFn =
  async function _configureWorkerRequestHandler({
    server,
    autoDiscoveredFiles,
    userOptions: _userOptions,
    hmrChannel,
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
        return handleWorkerServerAction(req, res, currentWorker, logger);
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
        logError(routeFiles.error, logger);
        return next();
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
        }
        const stream = handleWorkerRscStream({
          worker: currentWorker!,
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
          },
          ...handlerOptions,
        });

        // Pipe the stream to the response with error handling
        if (res.writable) {
          const readable = Readable.fromWeb(stream as unknown as ReadableStream);
          let headersSent = false;

          readable.on('data', (chunk) => {
            if (!headersSent) {
              // Only send headers when first chunk arrives
              res.setHeader("Content-Type", info.contentType);
              res.setHeader("Transfer-Encoding", "chunked");
              res.setHeader("Connection", "keep-alive");
              headersSent = true;
            }
            res.write(chunk);
          });

          readable.on('end', () => {
            res.end();
          });

          readable.on('error', (error) => {
            logError(error, logger);
            if (handlerOptions.verbose) {
              logger.info(`[react-client] Stream error caught, headersSent: ${headersSent}, setting status to 500`);
            }
            if (!headersSent) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "text/x-component; charset=utf-8");
              res.end();
            } else {
              // If error after headers, just end the response
              res.end();
            }
          });
        }
        // wait for timeout
      } catch (error) {
        logError(error, logger);
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
