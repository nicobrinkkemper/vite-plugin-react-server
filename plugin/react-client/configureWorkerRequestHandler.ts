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
import { requestInfo } from "../helpers/requestInfo.js";
import { performance } from "node:perf_hooks";
import { restartWorker } from "./restartWorker.js";
import { handleWorkerRscStream } from "./handleWorkerRscStream.js";
import { getRouteFiles } from "../helpers/getRouteFiles.js";
import type { RscWorkerInputMessage } from "../worker/types.js";
import { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import { PassThrough } from "node:stream";
import { logError, toError } from "../error/toError.js";

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
  let {
    // remove these
    projectRoot: _projectRoot,
    moduleBaseURL: _moduleBaseURL,
    ...handlerUserOptions
  } = _userOptions;
  const handlerOptions = Object.assign({}, handlerUserOptions, {
    moduleBaseURL: server.config.base,
    moduleBasePath: server.config.base,
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
    const serializedUserOptions = serializedOptions<T, InlineCSS>(
      handlerOptions,
      autoDiscoveredFiles
    );

    // Handle server action requests
    if (info.isServerActionRequest) {
      try {
        // Read request body
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        const body = Buffer.concat(chunks).toString();
        const parsed = JSON.parse(body);

        // Get action ID and args from the request body
        let id: string;
        let args: unknown[];
        if (Array.isArray(parsed)) {
          // Format 1: Direct args array
          args = parsed;
          id = req.url?.split("?")[0] ?? "";
        } else if (parsed && typeof parsed === "object" && "id" in parsed) {
          // Format 2: Object with id and args
          id = parsed.id;
          args = parsed.args ?? [];
        } else {
          throw new Error("Invalid server action request format");
        }

        // Set up response headers for streaming
        res.setHeader("Content-Type", "text/x-component; charset=utf-8");
        res.setHeader("Transfer-Encoding", "chunked");
        res.setHeader("Connection", "keep-alive");

        if (!currentWorker) {
          currentWorker = await restartWorker({
            server,
            autoDiscoveredFiles,
            userOptions: serializedUserOptions,
            hmrChannel,
          });
        }

        // Send server action request to worker
        currentWorker!.postMessage({
          type: "SERVER_ACTION",
          id,
          args,
        } satisfies RscWorkerInputMessage);

        // Create a pass-through stream for the response
        const passThrough = new PassThrough();
        passThrough.pipe(res);

        // Handle worker messages
        const messageHandler = (message: any) => {
          if (message.type === "RSC_CHUNK") {
            passThrough.write(message.chunk);
          } else if (message.type === "RSC_END") {
            passThrough.end();
            currentWorker!.removeListener("message", messageHandler);
          } else if (message.type === "ERROR") {
            passThrough.end();
            currentWorker!.removeListener("message", messageHandler);
            logError(message.error, server.config.logger);
          }
        };

        currentWorker!.on("message", messageHandler);

        // Handle errors
        passThrough.on("error", (error) => {
          logError(error, server.config.logger);
          res.end();
        });

        return;
      } catch (error) {
        const err = toError(error);
        logError(err, server.config.logger);
        res.statusCode = 500;
        res.end(
          JSON.stringify({
            type: "server-action-response",
            returnValue: {
              success: false,
              error: err.message,
            },
          })
        );
        return;
      }
    }

    // Handle RSC requests
    if (!info.isRscRequest) {
      return next();
    }

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
  let desiredPort = server.config.server.port;
  let shouldUpdatePublicOrigin = false;
  if (handlerOptions.publicOrigin.includes(`:${desiredPort}`)) {
    shouldUpdatePublicOrigin = true;
  }
  // Listen for when the server actually starts
  if (shouldUpdatePublicOrigin) {
    server.httpServer?.once("listening", () => {
      const address = server.httpServer?.address();
      if (address && typeof address !== "string") {
        const port = address.port;
        if (port !== desiredPort) {
          process.env.VITE_PUBLIC_ORIGIN = handlerOptions.publicOrigin;
          handlerOptions.publicOrigin = handlerOptions.publicOrigin.replace(
            `:${desiredPort}`,
            `:${port}`
          );
        }
      }
    });
  }
  // done
}
