import type { Logger, ViteDevServer } from "vite";
import type {
  AutoDiscoveredFiles,
  RenderMetrics,
  RequestHandler,
  ResolvedUserOptions,
  StreamMetrics,
} from "../types.js";
import type {
  RscRenderMessage,
} from "../worker/types.js";
import type { Worker as NodeWorker } from "node:worker_threads";
import { MessageChannel } from "node:worker_threads";
import {
  serializedOptions,
} from "../helpers/serializeUserOptions.js";
import { getRouteFiles } from "../helpers/getRouteFiles.js";
import { requestToRoute } from "../helpers/requestToRoute.js";
import { performance } from "node:perf_hooks";
import { createWorkerStream } from "./createWorkerStream.js";
import { restartWorker } from "./restartWorker.js";


/**
 * Handles the RSC stream from the worker.
 * Creates a ReadableStream that pipes RSC chunks to the response.
 *
 * @param worker - The worker thread
 * @param message - The RSC render message
 * @returns A ReadableStream that yields RSC chunks
 */
export function handleWorkerRscStream(
  worker: NodeWorker,
  message: Omit<RscRenderMessage, "type" | "id">,
  logger: Logger,
  onMetrics?: (metrics: StreamMetrics) => void
): ReadableStream<Uint8Array> {
  // Create a ReadableStream from the async generator
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of createWorkerStream(
          worker,
          message,
          logger,
          onMetrics
        )) {
          controller.enqueue(chunk);
        }
      } catch (error) {
        const err =
          error instanceof Error
            ? error
            : typeof error === "string"
            ? new Error(error)
            : typeof error === "object" && error != null
            ? {
                message:
                  "message" in error ? String(error.message) : "Unknown error",
                stack: "stack" in error ? String(error.stack) : "",
                name: "name" in error ? String(error.name) : "Error",
              }
            : {
                message: "Unknown error",
                stack: "",
                name: "Error",
              };
        logger.error(err.message, {
          error: err,
        });
        controller.error(err);
      } finally {
        controller.close();
      }
    },
  });
}

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
    moduleBaseURL:
      typeof server.config.server.host === "string"
        ? `${server.config.server.https ? "https" : "http"}://${
            server.config.server.host
          }:${server.config.server.port}`
        : _moduleBaseURL,
    moduleBasePath:
      server.config.base === "/"
        ? ""
        : server.config.base.endsWith("/")
        ? server.config.base.slice(0, -1)
        : server.config.base,
    projectRoot: server.config.root,
  });

  // Start the worker
  const currentWorker = await restartWorker(server, autoDiscoveredFiles, handlerOptions, hmrChannel);

  // Create the request handler
  const handler: RequestHandler = async (req, res, next) => {
    if (!req.url || req.headers.accept !== "text/x-component") return next();
    try {
      if (!currentWorker) {
        server.config.logger.error("[react-client] No worker available");
        return next();
      }

      // Get the route from the request
      let route = requestToRoute(req, {
        moduleBasePath: handlerOptions.moduleBasePath,
        build: handlerOptions.build,
      });
      if (!route) {
        return next();
      }
      // in the case of the no build.pages and a async Page and or props userOption, we need to await those
      // if they are already autoDiscovered then the promise will resolve immediately
      const routeFiles = await getRouteFiles(
        route,
        autoDiscoveredFiles,
        handlerOptions
      );
      if (routeFiles.type === "error") {
        server.config.logger.error(
          `[react-client] Error fetching route files for ${route}`,
          {
            error: routeFiles.error,
            timestamp: true,
            environment: "server",
          }
        );
        return next();
      }
      const { page, props } = routeFiles;

      // Set up response headers for streaming
      res.setHeader("Content-Type", "text/x-component; charset=utf-8");
      res.setHeader("Transfer-Encoding", "chunked");
      res.setHeader("Connection", "keep-alive");
      const serializedUserOptions = serializedOptions(
        handlerOptions,
        autoDiscoveredFiles
      );
      const startTime = performance.now();
      const stream = handleWorkerRscStream(
        currentWorker,
        {
          ...serializedUserOptions,
          // we make the worker stream aware of the route, pagePath, propsPath
          route,
          pagePath: page,
          propsPath: props,
          // override these at all times to ensure the settings will work for the dev server
          projectRoot: server.config.root,
          build: serializedUserOptions.build,
          manifest: autoDiscoveredFiles.staticManifest,
          cssFiles: new Map(),
          globalCss: new Map(),
        },
        server.config.logger,
        typeof onMetrics === "function"
          ? (metrics) => {
              const elapsedTime = performance.now() - startTime;
              const formattedMetrics = {
                route,
                htmlSize: 0,
                rscSize: metrics.bytes,
                processingTime: elapsedTime,
                chunks: metrics.chunks,
                chunkRate: metrics.chunks / (elapsedTime / 1000),
                memoryUsage: process.memoryUsage(),
                streamMetrics: {
                  ...metrics,
                  duration: elapsedTime
                },
                htmlSizes: new Map(),
                rscSizes: new Map([[route, metrics.bytes]]),
              } satisfies RenderMetrics;
              onMetrics(formattedMetrics);
            }
          : undefined
      );
      const writeStream = new WritableStream({
        write(chunk) {
          res.write(chunk);
        },

        close() {
          clearTimeout(timeout);
          res.end();
        },
        abort() {
          clearTimeout(timeout);
          // Restart worker on error
          restartWorker(
            server,
            autoDiscoveredFiles,
            handlerOptions,
            hmrChannel
          );
          res.end();
        },
      });
      let timeout: NodeJS.Timeout;

      // Pipe the stream to the response
      stream.pipeTo(writeStream);
      // wait for timeout
      timeout = setTimeout(() => {
        server.config.logger.error("RSC render timeout");
        res.end();
      }, 5000);
    } catch (error) {
      if (error instanceof Error) {
        server.config.logger.error(error.message, {
          error,
        });
      }
    }
  };
  // attach handler to the server
  server.middlewares.use(handler);
  // done
}
