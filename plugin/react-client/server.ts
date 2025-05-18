import type { ViteDevServer } from "vite";
import type {
  AutoDiscoveredFiles,
  RenderMetrics,
  RequestHandler,
  ResolvedUserOptions,
  StreamMetrics,
} from "../types.js";
import { MessageChannel } from "node:worker_threads";
import { serializedOptions } from "../helpers/serializeUserOptions.js";
import { requestInfo } from "../helpers/requestInfo.js";
import { performance } from "node:perf_hooks";
import { restartWorker } from "./restartWorker.js";
import { handleWorkerRscStream } from "./handleWorkerRscStream.js";


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
  verbose = false
}: {
  server: ViteDevServer;
  autoDiscoveredFiles: AutoDiscoveredFiles;
  userOptions: ResolvedUserOptions;
  hmrChannel: MessageChannel;
  onMetrics?: (metrics: RenderMetrics) => void;
  verbose?: boolean;
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
  const currentWorker = await restartWorker({
    server,
    autoDiscoveredFiles,
    userOptions: handlerOptions,
    hmrChannel,
    verbose
  });
  const logger = server.config.logger
  // Create the request handler
  const handler: RequestHandler = async (req, res, next) => {
    if (!req.url) return next();
    if(verbose) logger.info(`Received request: ${req.url}`)

    const info = requestInfo(req, handlerOptions, "");
    if (!info.isRscRequest) return next();
    if(verbose) logger.info(`Request info: ${JSON.stringify(info)}`)

    if (!currentWorker) {
      logger.warn("[react-client] No worker available");
      return next();
    }

    if (!autoDiscoveredFiles.urlMap.has(info.route)) {
      logger.warn(`[react-client] No route found for route: ${info.route}`);
      return next();
    }
    try {
      const routeFiles = autoDiscoveredFiles.urlMap.get(info.route)!;
      const pagePath = routeFiles.page;
      const propsPath = routeFiles.props;
      // Set up response headers for streaming
      res.setHeader("Content-Type", info.contentType);
      res.setHeader("Transfer-Encoding", "chunked");
      res.setHeader("Connection", "keep-alive");

      const serializedUserOptions = serializedOptions(
        handlerOptions,
        autoDiscoveredFiles
      );
      const userOnMetrics = typeof onMetrics === "function"
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
      : ()=>{};
      const startTime = performance.now();
      const stream = handleWorkerRscStream({
        worker: currentWorker,
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
        verbose
      });
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
          restartWorker({
            server,
            autoDiscoveredFiles,
            userOptions: handlerOptions,
            hmrChannel,
            verbose
          });
          res.end();
        },
      });
      let timeout: NodeJS.Timeout;

      // Pipe the stream to the response
      stream.pipeTo(writeStream);
      // wait for timeout
      timeout = setTimeout(() => {
        currentWorker.postMessage('SHUTDOWN')
        server.config.logger.error("RSC render timeout.");
        res.end();
      }, 5000);
    } catch (error) {
      if (error instanceof Error) {
        server.config.logger.error(error.message + (error.stack ?? ''), {
          error,
        });
      }
    }
  };
  // attach handler to the server
  server.middlewares.use(handler);
  // done
}
