import type { RequestHandler } from "../types.js";
import { type Worker } from "node:worker_threads";
import { serializedOptions } from "../helpers/serializeUserOptions.js";
import { requestInfo } from "../helpers/requestInfo.js";
import { restartWorker } from "./restartWorker.client.js";
import { handleRscStream } from "../stream/handleRscStream.client.js";
import { getRouteFiles } from "../helpers/getRouteFiles.js";
import type { RscWorkerInputMessage } from "../worker/rsc/types.js";

import { handleServerAction } from "./handleServerAction.client.js";
import type { ConfigureWorkerRequestHandlerFn } from "../react-client/types.js";
import { handleError } from "../error/handleError.js";
import { getNodeEnv } from "../config/getNodeEnv.js";
import { isReactServerCondition } from "../config/getCondition.js";
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
    configEnv,
    hmrChannel,
    onWorkerCreated,
  }) {
    const logger = server.config.customLogger || server.config.logger;
    const {
      // remove these
      moduleBaseURL: _moduleBaseURL,
      ...handlerUserOptions
    } = _userOptions;
    const handlerOptions = Object.assign({}, handlerUserOptions, {
      moduleBaseURL: server.config.base,
      projectRoot: _userOptions.projectRoot || server.config.root,
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
    let restartWorkerForHMR: (() => Promise<void>) | null = null;

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
      
      if (handlerOptions.verbose) {
        server.config.logger.info(`[configureRequestHandler] handlerOptionsWithUrl.projectRoot: ${handlerOptionsWithUrl.projectRoot}`);
        server.config.logger.info(`[configureRequestHandler] handlerOptions.projectRoot: ${handlerOptions.projectRoot}`);
      }
      
      // Serialize user options for worker
      const serializedUserOptions = serializedOptions(
        handlerOptionsWithUrl,
        autoDiscoveredFiles
      );
      
      // Define restart function for HMR (needs serializedUserOptions)
      if (!restartWorkerForHMR) {
        restartWorkerForHMR = async () => {
          // Same path whether or not a worker already exists — restartWorker
          // tears down any current worker before spawning the replacement.
          currentWorker = await restartWorker({
            server,
            autoDiscoveredFiles,
            userOptions: serializedUserOptions,
            configEnv: configEnv,
            hmrChannel,
          });
          if (currentWorker && restartWorkerForHMR) {
            onWorkerCreated?.(currentWorker, restartWorkerForHMR);
          }
        };
      }
      
      if (handlerOptions.verbose) {
        server.config.logger.info(`[configureRequestHandler] serializedUserOptions.projectRoot: ${serializedUserOptions.projectRoot}`);
      }

      // Handle server action requests
      if (info.isServerActionRequest) {
        if (!currentWorker) {
          currentWorker = await restartWorker({
            server,
            autoDiscoveredFiles,
            userOptions: serializedUserOptions,
            configEnv: configEnv,
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
      // Note: htmlPath not used for RSC requests (always "" for headless mode)
      
      // Pre-load props on main thread to apply Vite transforms (server actions need this).
      // Only when the main process actually runs the react-server condition (dev:rsc):
      // a props module pulls the server graph (and any client component it reaches loads
      // its registerClientReference form, which imports react-server-dom-esm-server and
      // hard-requires react-server). In dev:ssr the main thread is NOT react-server, so we
      // must NOT attempt this — the worker loads props instead. Attempting it there made
      // Vite's ModuleRunner log a "react-server condition must be enabled" error during
      // full reloads even though we caught the rejection (bd-u7v). Gate on the condition
      // so the doomed import never runs in dev:ssr.
      let resolvedPageProps: Record<string, unknown> | undefined;
      if (propsPath) {
        try {
          const fullPropsPath = `${handlerOptions.projectRoot}/${propsPath}`;
          const serverEnv = server.environments?.['server'];
          let propsModule: any;

          if (handlerOptions.verbose) {
            logger.info(`[configureRequestHandler] Pre-loading props from: ${fullPropsPath}`);
          }

          if (
            isReactServerCondition() &&
            serverEnv &&
            'runner' in serverEnv &&
            serverEnv.runner
          ) {
            // dev:rsc — main thread has the react-server condition, so the server
            // environment runner can evaluate the props (and the server graph) directly.
            try {
              propsModule = await (serverEnv.runner as any).import(fullPropsPath);
            } catch (runnerError: any) {
              if (handlerOptions.verbose) {
                logger.info(`[configureRequestHandler] Main-thread props import failed; worker will load props`);
              }
              propsModule = null;
            }
          } else {
            // dev:ssr (no react-server on the main thread) or no server env:
            // the worker loads props in its react-server context.
            propsModule = null;
          }
          const propsExportName = handlerOptions.propsExportName || "props";
          
          // Only process if we got a module (server runner succeeded)
          if (propsModule) {
            const propsExport = propsModule[propsExportName];
          
            if (typeof propsExport === "function") {
            // Call the props function with the URL
            let result = propsExport(info.url);
            if (result instanceof Promise) {
              result = await result;
            }
            resolvedPageProps = result;
            if (handlerOptions.verbose) {
              logger.info(`[configureRequestHandler] Pre-loaded props for ${info.route}: ${Object.keys(resolvedPageProps || {}).length} keys`);
            }
          } else if (propsExport && typeof propsExport === "object") {
            resolvedPageProps = propsExport;
          }
          }  // end if (propsModule)
        } catch (error) {
          if (handlerOptions.verbose) {
            logger.warn(`[configureRequestHandler] Failed to pre-load props: ${error}`);
          }
          // Continue without pre-loaded props, worker will try to load them
        }
      }
      
      try {
        // Set up response headers for streaming
        res.setHeader("Content-Type", info.contentType);
        res.setHeader("Transfer-Encoding", "chunked");
        res.setHeader("Connection", "keep-alive");
        
        // CRITICAL: Disable caching in development mode
        // Without this, browsers cache RSC streams and don't show updates
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");

        const userOnMetrics = handlerOptions.onMetrics;

        // Spawn the worker lazily on the first request. The ModuleRunner
        // handles per-module invalidation via the HMR_UPDATE message
        // handler, so a long-lived worker can keep serving across edits.
        if (!currentWorker) {
          currentWorker = await restartWorker({
            server,
            autoDiscoveredFiles,
            userOptions: serializedUserOptions,
            configEnv: configEnv,
            hmrChannel,
          });
        }
        if (!currentWorker) {
          throw new Error("Failed to start worker");
        }
        // Notify about worker creation
        onWorkerCreated?.(currentWorker, restartWorkerForHMR);

        const stream = handleRscStream({
          options: {
            ...serializedUserOptions,
            worker: currentWorker,
            id: info.route,
            type: "INIT",
            logger,
            // we make the worker stream aware of the route, pagePath, propsPath, rootPath, htmlPath
            route: info.route,
            url: info.url,
            pagePath: pagePath,
            propsPath: propsPath,
            // Pass pre-resolved props (loaded via Vite's ssrLoadModule for proper transforms)
            resolvedPageProps: resolvedPageProps,
            rootPath: rootPath,
            // CRITICAL: For RSC requests, use htmlPath: "" for headless mode (no Html wrapper)
            // This prevents hydration errors where <html> would be rendered inside #root div
            htmlPath: "",  // Empty string = headless RSC (no Html wrapper)
            // Component overrides (undefined for file-based components in client dev)
            HtmlComponent: undefined,
            RootComponent: undefined,
            // Use userOptions.projectRoot if available, otherwise fall back to server.config.root
            projectRoot: serializedUserOptions.projectRoot || server.config.root,
            build: {
              ...(serializedUserOptions.build || {}),
              pages: Array.isArray(serializedUserOptions.build?.pages)
                ? serializedUserOptions.build.pages
                : [],
            },
            manifest: {},
            cssFiles: new Map(),
            globalCss: new Map(),
            serverPipeableStreamOptions: serializedUserOptions.serverPipeableStreamOptions,
            clientPipeableStreamOptions: serializedUserOptions.clientPipeableStreamOptions,
          } as any,
          handlers: {
            onMetrics: (id, metrics) => {
              metrics.route = id;
              userOnMetrics?.(metrics);
            },
            onHmrAccept: () => {
            },
            onHmrUpdate: () => {
            },
            // Always log shell errors. Without this an RSC render failure in
            // the worker would surface only via `verbose: true`, leaving the
            // user with a half-streamed RSC response and no explanation.
            onShellError: (id, error) => {
              logger.error(
                `[configureRequestHandler:${id}] RSC shell error: ${error instanceof Error ? error.message : String(error)}`,
                { error: error instanceof Error ? error : new Error(String(error)) },
              );
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
        // Response is now being streamed - no need to wait for timeout
      } catch (error) {
        // Always log: misconfigured apps would otherwise return an empty 500
        // and leave the user staring at a hung tab without any console output.
        const panicError = handleError({
          error,
          logger,
          mode: getNodeEnv(server.config.mode),
          panicThreshold: handlerOptions.panicThreshold,
          critical: false,
          context: "configureWorkerRequestHandler",
          log: true,
        });
        if (panicError != null) {
          throw panicError;
        }
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          const message = error instanceof Error ? error.message : String(error);
          res.end(`RSC render failed: ${message}\n`);
        } else {
          res.end();
        }
      }
    };
    // attach handler to the server
    server.middlewares.use(handler);
    // port check, should be handled by strictPort
  };
