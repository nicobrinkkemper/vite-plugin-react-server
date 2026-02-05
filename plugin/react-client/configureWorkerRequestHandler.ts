import type { ViteDevServer } from "vite";
import type {
  AutoDiscoveredFiles,
  InlineCssOpt,
  PagePropOpt,
  RenderMetrics,
  RequestHandler,
  ResolvedUserOptions,
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

async function shutdownWorker(worker: Worker): Promise<void> {
  worker.postMessage({
    type: "SHUTDOWN",
    id: "*",
  } satisfies RscWorkerInputMessage);
  await new Promise<void>((resolve, reject) => {
    worker.on("message", (message) => {
      if (message.type === "SHUTDOWN_COMPLETE") resolve();
      else reject(new Error("Did not receive SHUTDOWN_COMPLETE"));
    });
  });
  worker.removeAllListeners();
}

/**
 * Configures the worker request handler.
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
  const logger = server.config.logger;

  // Cache serialized options — only changes on server restart
  const cachedSerializedOptions = serializedOptions<T, InlineCSS>(
    handlerOptions,
    autoDiscoveredFiles
  );

  let currentWorker: Worker | null = null;

  const ensureWorker = async () => {
    if (!currentWorker) {
      currentWorker = await restartWorker({
        server,
        autoDiscoveredFiles,
        userOptions: cachedSerializedOptions,
        hmrChannel,
      });
    }
    if (!currentWorker) throw new Error("Failed to start worker");
    return currentWorker;
  };

  setupServerRestartHandler(server, async () => {
    logger.info("[react-client] Server restarting, shutting down worker...");
    if (currentWorker) {
      await shutdownWorker(currentWorker);
      currentWorker = null;
    }
  });

  const handler: RequestHandler = createRequestHandler(
    handlerOptions,
    "",
    logger,
    {
      onServerAction: async (_info, req, res) => {
        const worker = await ensureWorker();
        return handleWorkerServerAction(req, res, worker, logger);
      },
      onRsc: async (info, _req, res, next) => {
        const routeFiles = await getRouteFiles(
          info.route,
          autoDiscoveredFiles,
          handlerOptions
        );
        if (routeFiles.type === "error") {
          logger.error(routeFiles.error.message);
          return next();
        }

        try {
          setupRscResponseHeaders(res, info.contentType, true);

          const startTime = performance.now();
          const worker = await ensureWorker();

          const stream = handleWorkerRscStream({
            worker,
            message: {
              ...cachedSerializedOptions,
              id: info.route,
              route: info.route,
              pagePath: routeFiles.page,
              propsPath: routeFiles.props,
              projectRoot: server.config.root,
              build: cachedSerializedOptions.build,
              manifest: autoDiscoveredFiles.staticManifest,
              cssFiles: new Map(),
              globalCss: new Map(),
            },
            logger,
            handlers: {
              onMetrics: (_id, metrics) => {
                if (typeof onMetrics !== "function") return;
                const elapsedTime = performance.now() - startTime;
                onMetrics({
                  route: info.route,
                  htmlSize: 0,
                  rscSize: metrics.bytes,
                  processingTime: elapsedTime,
                  chunks: metrics.chunks,
                  chunkRate: metrics.chunks / (elapsedTime / 1000),
                  memoryUsage: process.memoryUsage(),
                  streamMetrics: { ...metrics, duration: elapsedTime },
                  htmlSizes: new Map(),
                  rscSizes: new Map([[info.route, metrics.bytes]]),
                });
              },
              onHmrAccept: () => {},
              onHmrUpdate: () => {},
            },
            verbose: handlerOptions.verbose,
          });

          await pipeRscStreamToResponse(res, stream, {
            timeoutMs: handlerOptions.rscTimeoutMs,
            logger,
            timeoutMessage: "RSC render timeout.",
            onTimeout: async () => {
              if (currentWorker) {
                await shutdownWorker(currentWorker);
                currentWorker = null;
              }
            },
          });
        } catch (error) {
          if (error instanceof Error) {
            logger.error(error.message + (error.stack ?? ""), { error });
          }
        }
      },
    }
  );

  server.middlewares.use(handler);
}
