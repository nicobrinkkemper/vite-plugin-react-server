import type { ViteDevServer } from "vite";
import type {
  AutoDiscoveredFiles,
  RenderMetrics,
  RequestHandler,
  ResolvedUserOptions,
  StreamMetrics,
} from "../types.js";
import type { MessageChannel } from "node:worker_threads";
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

export type ConfigureWorkerRequestHandlerFn = (props: {
  server: ViteDevServer;
  autoDiscoveredFiles: AutoDiscoveredFiles;
  userOptions: ResolvedUserOptions;
  hmrChannel: MessageChannel;
}) => void;

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
    const {
      // remove these
      projectRoot: _projectRoot,
      moduleBaseURL: _moduleBaseURL,
      ...handlerUserOptions
    } = _userOptions;
    const handlerOptions = Object.assign({}, handlerUserOptions, {
      moduleBaseURL: server.config.base,
      projectRoot: server.config.root,
    });

    // Start the worker
    let currentWorker: Worker | null = null;
    const logger = server.config.logger;

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

      const info = requestInfo(req, handlerOptions, "", server.config.logger);

      // Serialize user options for worker
      const serializedUserOptions = serializedOptions(
        handlerOptions,
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
        return handleWorkerServerAction(
          req,
          res,
          currentWorker,
          server.config.logger
        );
      }

      // Handle RSC requests
      if (!info.isRscRequest) {
        return next();
      }

      const routeFiles = await getRouteFiles(
        info.route,
        autoDiscoveredFiles,
        handlerOptions,
        server.config.logger
      );
      if (routeFiles.type === "error") {
        logger.error(routeFiles.error.message);
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
                handlerOptions.onMetrics(formattedMetrics);
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
          logger,
          handlers: {
            onMetrics: (id, metrics) => {
              metrics.route = id;
              userOnMetrics(metrics);
            },
            onHmrAccept: () => {
              // TODO: implement
              // console.log("onHmrAccept", routes);
            },
            onHmrUpdate: () => {
              // TODO: implement
              // console.log("onHmrUpdate", routes);
            },
          },
          verbose: handlerOptions.verbose,
          rscTimeout: handlerOptions.rscTimeout,
        });

        // Pipe the stream to the response
        if (res.writable) {
          Readable.fromWeb(stream as unknown as ReadableStream).pipe(res);
        }
        // wait for timeout
      } catch (error) {
        if (error instanceof Error) {
          server.config.logger.error(error.message + (error.stack ?? ""), {
            error,
          });
        }
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
        server.config.logger.error("RSC render timeout.");
        clearTimeout(timeout!);
        res.end();
      }
    };
    // attach handler to the server
    server.middlewares.use(handler);
    // port check, should be handled by strictPort
  };
