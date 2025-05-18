import type { ViteDevServer } from "vite";
import type {
  AutoDiscoveredFiles,
  RenderMetrics,
  RequestHandler,
  ResolvedUserOptions,
  StreamMetrics,
} from "../types.js";
import { MessageChannel, type Worker } from "node:worker_threads";
import { serializedOptions } from "../helpers/serializeUserOptions.js";
import { requestInfo } from "../helpers/requestInfo.js";
import { performance } from "node:perf_hooks";
import { restartWorker } from "./restartWorker.js";
import { handleWorkerRscStream } from "./handleWorkerRscStream.js";
import { getRouteFiles } from "../helpers/getRouteFiles.js";
import type { RscWorkerInputMessage } from "../worker/types.js";
import { Readable } from "node:stream";
import { ReadableStream } from "node:stream/web";

/**
 * Configures the worker request handler.
 * @param server - The Vite dev server
 * @param autoDiscoveredFiles - The auto discovered files
 * @param userOptions - The user options
 */
export async function configureWorkerRequestHandler({
  server,
  autoDiscoveredFiles,
  userOptions: _userOptions,
  hmrChannel,
  onMetrics,
}: {
  server: ViteDevServer;
  autoDiscoveredFiles: AutoDiscoveredFiles;
  userOptions: ResolvedUserOptions;
  hmrChannel: MessageChannel;
  onMetrics?: (metrics: RenderMetrics) => void;
}) {
  let {
    // remove these
    projectRoot: _projectRoot,
    moduleBaseURL: _moduleBaseURL,
    moduleBasePath: _moduleBasePath,
    ...handlerUserOptions
  } = _userOptions;
  const handlerOptions = Object.assign({}, handlerUserOptions, {
    moduleBaseURL: server.config.base,
    moduleBasePath: _moduleBasePath,
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
    if (handlerOptions.verbose) logger.info(`Received request: ${req.url}`);

    const info = requestInfo(req, handlerOptions, "");
    if (!info.isRscRequest) return next();
    if (handlerOptions.verbose)
      logger.info(`Request info: ${JSON.stringify(info)}`);

    const routeFiles = await getRouteFiles(
      info.route,
      autoDiscoveredFiles,
      handlerOptions
    );
    if (routeFiles.type === "error") {
      logger.error(routeFiles.error.message);
      return next();
    }
    const pagePath = routeFiles.page;
    const propsPath = routeFiles.props;
    try {
      // Set up response headers for streaming
      res.setHeader("Content-Type", info.contentType);
      res.setHeader("Transfer-Encoding", "chunked");
      res.setHeader("Connection", "keep-alive");

      const serializedUserOptions = serializedOptions(
        handlerOptions,
        autoDiscoveredFiles
      );
      const userOnMetrics =
        typeof onMetrics === "function"
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
              onMetrics(formattedMetrics);
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
          // we make the worker stream aware of the route, pagePath, propsPath
          route: info.route,
          pagePath: pagePath,
          propsPath: propsPath,
          // override these at all times to ensure the settings will work for the dev server
          projectRoot: server.config.root,
          build: serializedUserOptions.build,
          manifest: autoDiscoveredFiles.staticManifest,
          cssFiles: new Map(),
          globalCss: new Map(),
        },
        logger,
        handlers: {
          onMetrics: userOnMetrics,
          onHmrAccept: (routes: string[]) => {
            // TODO: implement
            console.log("onHmrAccept", routes);
          },
          onHmrUpdate: (routes: string[]) => {
            // TODO: implement
            console.log("onHmrUpdate", routes);
          },
        },
        verbose: handlerOptions.verbose,
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
        }, 5000);
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
              reject("Dit not receive SHUTDOWN_COMPLETE");
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
  // done
}
