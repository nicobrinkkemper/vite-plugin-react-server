import type { ServerResponse } from "http";
import React from "react";
import { collectViteModuleGraphCss } from "../helpers/collectViteModuleGraphCss.js";
import { createRenderToPipeableStreamHandler } from "../stream/createRenderToPipeableStreamHandler.server.js";
import { requestInfo } from "../helpers/requestInfo.js";
import { getRouteFiles } from "../helpers/getRouteFiles.js";
import { handleServerAction } from "./handleServerAction.js";
import type { ConfigureReactServerFn } from "./types.js";
import { handleError } from "../error/handleError.js";
import { mergeConfig, type ResolvedConfig } from "vite";

export const configureReactServer: ConfigureReactServerFn =
  function _configureReactServer({
    server,
    autoDiscoveredFiles,
    userOptions: _userOptions,
    serverManifest,
    resolvedConfig,
  }) {
    const activeStreams = new Set<ServerResponse>();
    const activeControllers = new Map<
      ServerResponse,
      { abort: (reason?: unknown) => void }
    >();
    let isRestarting = false;
    const logger = server.config.customLogger || server.config.logger;
    const {
      Html: _UserHtmlComponent,
      // loader config isn't important here, since that's used by the transformer
      loader: _loaderConfig,
      verbose,
      // we can use these directly to create the handler
      ...userHandlerOptions
    } = _userOptions;

    server.config = mergeConfig(
      server.config,
      resolvedConfig
    ) as ResolvedConfig;

    // Handle Vite server restarts
    server.ws.on("restart", (path) => {
      logger.info(
        "[vite-plugin-react-server] 🔧 Plugin changed, preparing for restart:",
        path
      );

      isRestarting = true;

      // Abort all active streams first, then close responses
      for (const res of activeStreams) {
        const controller = activeControllers.get(res);
        if (controller) {
          try {
            controller.abort("Server restarting");
          } catch (e) {
            // Ignore abort errors
          }
        }

        res.writeHead(503, {
          "Content-Type": "text/x-component; charset=utf-8",
          "Retry-After": "1",
        });
        res.end(
          `0:E{"digest":"","name":"Error","message":"Server restarting...","stack":"","env":"Server"}`
        );
      }
      activeStreams.clear();
      activeControllers.clear();
    });

    // Handle restart completion
    server.ws.on("full-reload", () => {
      isRestarting = false;
      logger.info("[vite-plugin-react-server] ✅ Server restart completed");
    });

    // Fallback: reset restart flag after a timeout
    server.ws.on("restart", () => {
      setTimeout(() => {
        if (isRestarting) {
          isRestarting = false;
          logger.info(
            "[vite-plugin-react-server] ⏰ Restart timeout, resuming normal operation"
          );
        }
      }, 5000); // 5 second timeout
    });

    const loader = async (id: string) => {
      const [moduleID, exportName] = id.split("#");
      const result = await server.ssrLoadModule(moduleID);
      if (result == null)
        throw new Error(`Module \"${moduleID}\" does not have any exports`);

      if (!Object.keys(result).length && exportName.length)
        throw new Error(
          `Module \"${moduleID}\" is a module, but does not have any exports so it can't find ${exportName}`
        );

      if (exportName && !(exportName in result))
        throw new Error(
          `Module \"${moduleID}\" exists, but does not export \"${exportName}\"`
        );
      return result;
    };
    server.middlewares.use(async (req, res, next) => {
      if (!req.url) {
        return next();
      }
      const handlerOptions = {
        ...userHandlerOptions,
        moduleBaseURL: server.config.base,
        moduleBasePath: userHandlerOptions.moduleBasePath,
        projectRoot: server.config.root,
        css: userHandlerOptions.css,
        loader: loader,
        verbose,
        logger,
        rscStream: res
      };
      const info = requestInfo(req, handlerOptions, "");

      // Handle server actions
      if (info.isServerActionRequest) {
        return handleServerAction(req, res, server, handlerOptions);
      }
      if (!info.isRscRequest) {
        return next();
      }

      // If server is restarting, return 503 immediately
      if (isRestarting) {
        res.writeHead(503, {
          "Content-Type": "text/x-component; charset=utf-8",
          "Retry-After": "1",
        });
        res.end(
          `0:E{"digest":"","name":"Error","message":"Server restarting...","stack":"","env":"Server"}`
        );
        return;
      }

      try {
        const routeFiles = await getRouteFiles(
          info.route,
          autoDiscoveredFiles,
          _userOptions,
          logger
        );
        if (routeFiles.type === "error") {
          const panicError = handleError({
            error: routeFiles.error,
            logger: logger,
            panicThreshold: userHandlerOptions.panicThreshold,
            critical: false,
            context: "configureReactServer",
          });
          if (panicError != null) {
            return next(panicError);
          }
          return next();
        }
        const pagePath = routeFiles.page;
        const propsPath = routeFiles.props;

        // Check if we have a page path - if not, skip this route
        if (!pagePath) {
          if (verbose) {
            logger.info(`No page found for route: ${info.route}, skipping`);
          }
          return next();
        }

        if (verbose) {
          logger.info(
            `Components resolved successfully for route: ${info.route}`
          );
        }

        if (verbose) {
          logger.info(
            `PageComponent is valid, creating handler options for route: ${info.route}`
          );
        }

        const handlerOptions = {
          ...userHandlerOptions,
          route: info.route,
          pagePath,
          propsPath,
          logger: logger,
          manifest: serverManifest,
          server,
          moduleBaseURL: server.config.base,
          projectRoot: server.config.root,
          loader: loader,
          verbose: verbose,
        };

        if (verbose) {
          logger.info(`Collecting CSS files for route: ${info.route}`);
        }

        const cssFilesResult = await collectViteModuleGraphCss({
          moduleGraph: server.moduleGraph,
          parentUrl: pagePath,
          handlerOptions: handlerOptions,
        });

        if (verbose) {
          logger.info(`CSS collection completed for route: ${info.route}`);
        }

        if (cssFilesResult.type === "skip") {
          return next();
        }
        if (cssFilesResult.type === "error") {
          return next(cssFilesResult.error);
        }

        if (verbose) {
          logger.info(
            `Creating final handler options for route: ${info.route}`
          );
        }

        if (verbose) {
          logger.info(`Creating RSC handler for route: ${info.route}`);
        }

        // Create the headless RSC stream directly
        const rscResult = createRenderToPipeableStreamHandler({
          ...handlerOptions,
          url: handlerOptions.route,
          PageComponent: React.Fragment, // Headless RSC - no page component
          RootComponent: React.Fragment, // Headless RSC - no root component  
          HtmlComponent: React.Fragment, // Headless RSC - no HTML wrapper
        });

        if (verbose) {
          logger.info(
            `RSC handler created for route: ${
              info.route
            }, result type: ${typeof rscResult}, has pipe: ${typeof rscResult?.pipe}, has abort: ${typeof rscResult?.abort}`
          );
        }

        if (rscResult && typeof rscResult.pipe === "function") {
          if (verbose) {
            logger.info(`Setting up RSC stream for route: ${info.route}`);
          }

          // set headers
          res.setHeader("Content-Type", "text/x-component; charset=utf-8");
          
          // Add CORS headers for RSC files
          const origin = req.headers.origin;
          if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
            res.setHeader("Access-Control-Allow-Origin", origin);
          } else {
            res.setHeader("Access-Control-Allow-Origin", "*");
          }
          res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
          res.setHeader("Access-Control-Max-Age", "86400");
          rscResult.pipe(res);

          // Store the controller for potential abort during restart
          activeControllers.set(res, rscResult);
        } else {
          if (verbose) {
            logger.error(
              `RSC handler failed for route: ${
                info.route
              }, invalid result: ${typeof rscResult}`
            );
          }
          // Handle the error case
          res.statusCode = 500;
          res.end("Internal Server Error");
        }
        activeStreams.add(res);
        res.on("close", () => {
          activeStreams.delete(res);
          activeControllers.delete(res);
        });
      } catch (error) {
        const panicError = handleError({
          error,
          logger,
          panicThreshold: handlerOptions.panicThreshold,
          critical: false,
          context: "configureReactServer",
        });
        if (panicError != null) {
          return next(panicError);
        }

        res.statusCode = 500;
        res.setHeader("Content-Type", "text/x-component; charset=utf-8");
        res.setHeader("Content-Length", "0"); // Will be updated after streaming
      }
    });
  };
