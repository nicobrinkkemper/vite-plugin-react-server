import type { ViteDevServer } from "vite";
import type {
  AutoDiscoveredFiles,
  InlineCssOpt,
  PagePropOpt,
  RenderMetrics,
  RequestHandler,
  ResolvedUserOptions,
  StreamMetrics,
} from "../types.js";
import { MessageChannel, type Worker } from "node:worker_threads";
import { serializedOptions } from "../helpers/serializeUserOptions.js";
import { createRequestHandler } from "../helpers/createRequestHandler.js";
import { performance } from "node:perf_hooks";
import { restartWorker } from "./restartWorker.js";
import { handleWorkerRscStream } from "./handleWorkerRscStream.js";
import { getRouteFiles } from "../helpers/getRouteFiles.js";
import type { RscWorkerInputMessage } from "../worker/types.js";
import { pipeRscStreamToResponse } from "../helpers/pipeRscStream.js";
import { handleWorkerServerAction } from "./handleWorkerServerAction.js";
import { createHandlerOptions } from "../helpers/createHandlerOptions.js";
import { setupRscResponseHeaders } from "../helpers/responseHeaders.js";
import { setupServerRestartHandler } from "../helpers/serverRestartHandler.js";

/**
 * Configures the worker request handler.
 * @param server - The Vite dev server
 * @param autoDiscoveredFiles - The auto discovered files
 * @param userOptions - The user options
 */
export async function configureWorkerRequestHandler<
  T extends PagePropOpt = PagePropOpt,
  InlineCSS extends InlineCssOpt = InlineCssOpt
>({
  server,
  autoDiscoveredFiles,
  userOptions: _userOptions,
  hmrChannel,
  onMetrics,
}: {
  server: ViteDevServer;
  autoDiscoveredFiles: AutoDiscoveredFiles;
  userOptions: ResolvedUserOptions<T, InlineCSS>;
  hmrChannel: MessageChannel;
  onMetrics?: (metrics: RenderMetrics) => void;
}) {
  const handlerOptions = createHandlerOptions<T, InlineCSS>(
    _userOptions,
    server
  );

  // Start the worker
  let currentWorker: Worker | null = null;
  const logger = server.config.logger;

  // Handle server restarts
  setupServerRestartHandler(server, async () => {
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
  const handler: RequestHandler = createRequestHandler(
    handlerOptions,
    "",
    server.config.logger,
    {
      onServerAction: async (_info, req, res) => {
        // Serialize user options for worker
        const serializedUserOptions = serializedOptions<T, InlineCSS>(
          handlerOptions,
          autoDiscoveredFiles
        );
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
      },
      onRsc: async (info, _req, res, next) => {
        // Serialize user options for worker
        const serializedUserOptions = serializedOptions<T, InlineCSS>(
          handlerOptions,
          autoDiscoveredFiles
        );
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
          setupRscResponseHeaders(res, info.contentType, true);

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
              id: info.route,
              type: "RSC_RENDER",
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
          });

          await pipeRscStreamToResponse(res, stream, {
            timeoutMs: handlerOptions.rscTimeoutMs,
            logger: server.config.logger,
            timeoutMessage: "RSC render timeout.",
            onTimeout: async () => {
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
            },
          });
        } catch (error) {
          if (error instanceof Error) {
            server.config.logger.error(error.message + (error.stack ?? ""), {
              error,
            });
          }
        }
      },
    }
  );
  // attach handler to the server
  server.middlewares.use(handler);
  // port check, should be handled by strictPort
}
