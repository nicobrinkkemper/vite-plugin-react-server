import type { ServerResponse } from "http";
import { collectViteModuleGraphCss } from "../helpers/collectViteModuleGraphCss.js";
import { resolveComponents } from "../helpers/resolveComponents.js";
import { createHandler } from "../helpers/createHandler.server.js";
import { requestInfo } from "../helpers/requestInfo.js";
import { getRouteFiles } from "../helpers/getRouteFiles.js";
import { handleServerAction } from "./handleServerAction.js";
import React from "react";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import type { ConfigureReactServerFn } from "./types.js";
import { handleError } from "../error/handleError.js";
import { PANIC_SYMBOL } from "../error/shouldPanic.js";


export const configureReactServer: ConfigureReactServerFn =
  function _configureReactServer({
    server,
    autoDiscoveredFiles,
    userOptions: _userOptions,
    serverManifest,
  }) {
    const activeStreams = new Set<ServerResponse>();
    const activeControllers = new Map<ServerResponse, { abort: (reason: unknown) => void; destroy: () => void }>();
    let isRestarting = false;
    const logger = server.config.customLogger || server.config.logger;
    const {
      Html: _UserHtmlComponent,
      onEvent,
      // loader config isn't important here, since that's used by the transformer
      loader: _loaderConfig,
      verbose,
      // we can use these directly to create the handler
      ...handlerUserOptions
    } = _userOptions;

    // Set environment-specific configuration
    const define = {
      ...server.config.define,
      "process.env.NODE_ENV": JSON.stringify(
        process.env["NODE_ENV"] || "production"
      ),
    };
    server.config = {
      ...server.config,
      define,
    };

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
          logger.info("[vite-plugin-react-server] ⏰ Restart timeout, resuming normal operation");
        }
      }, 5000); // 5 second timeout
    });
    
    const loader = async (id: string) => {
      const [moduleID, exportName] = id.split("#");
      const result = await server.ssrLoadModule(moduleID);
      if (!result) {
        return {};
      }
      if (exportName && !(exportName in result)) {
        throw new Error(
          `Module ${moduleID} does not have export ${exportName}`
        );
      }
      return result;
    };
    let panicError: Error | null = null;
    server.middlewares.use(async (req, res, next) => {
      if (!req.url) {
        return next();
      }
      const handlerOptions = {
        ...handlerUserOptions,
        moduleBaseURL: server.config.base,
        moduleBasePath: handlerUserOptions.moduleBasePath,
        projectRoot: server.config.root,
        css: handlerUserOptions.css,
        loader: loader,
        verbose,
        logger,
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
            panicThreshold: handlerOptions.panicThreshold,
            critical: false,
          });
          if (panicError!= null) {
            throw panicError;
          }
          return next();
        }
        const pagePath = routeFiles.page;
        const propsPath = routeFiles.props;
        const rootPath = routeFiles.root;
        const htmlPath = routeFiles.html;

        // Resolve all components together
        const componentsResult = await resolveComponents({
          pagePath,
          propsPath,
          rootPath,
          htmlPath,
          pageExportName: handlerOptions.pageExportName ?? DEFAULT_CONFIG.PAGE_EXPORT_NAME,
          propsExportName: handlerOptions.propsExportName ?? DEFAULT_CONFIG.PROPS_EXPORT_NAME,
          rootExportName: handlerOptions.rootExportName ?? DEFAULT_CONFIG.ROOT_EXPORT_NAME,
          htmlExportName: handlerOptions.htmlExportName ?? DEFAULT_CONFIG.HTML_EXPORT_NAME,
          route: info.route,
          loader: loader,
          verbose,
          moduleBaseURL: server.config.base,
          build: handlerOptions.build,
          logger: logger,
          HtmlComponent: React.Fragment,
          RootComponent: handlerOptions.components?.Root,
          
        });
        if (componentsResult.type === "error") {
          throw componentsResult.error;
        }

        const { PageComponent, pageProps, RootComponent } = componentsResult;

        
        const intermediateHandlerOptions = {
          ...handlerOptions,
          loader: loader,
          onEvent: onEvent,
          route: info.route,
          pagePath,
          propsPath,
          logger: logger,
          manifest: serverManifest,
          server,
        };
        const cssFilesResult = await collectViteModuleGraphCss({
          moduleGraph: server.moduleGraph,
          parentUrl: pagePath,
          handlerOptions: {
            ...handlerOptions,
            pagePath,
            moduleBaseURL: server.config.base,
            moduleBasePath: handlerUserOptions.moduleBasePath,
            projectRoot: server.config.root,
          },
        });
        if (cssFilesResult.type === "skip") {
          return next();
        }
        if (cssFilesResult.type === "error") {
          throw cssFilesResult.error;
        }

        const finalHandlerOptions = Object.assign(intermediateHandlerOptions, {
          PageComponent: PageComponent,
          pageProps: pageProps,
          RootComponent,
          HtmlComponent: React.Fragment,
          cssFiles: cssFilesResult.cssFiles ?? new Map(),
          globalCss: new Map(),
        });

        // Create the headless RSC stream directly
        const rscResult = createHandler(finalHandlerOptions);

        if (rscResult.type === "success") {
          // set headers
          res.setHeader("Content-Type", "text/x-component; charset=utf-8");
          rscResult.stream!.pipe(res);
          
          // Store the controller for potential abort during restart
          activeControllers.set(res, rscResult.controller);
        } else {
          // Handle panic logic here - throw if panicThreshold is "all_errors"
          if(verbose) {
            logger.info(`[configureReactServer] Error: ${JSON.stringify(rscResult)}`);
          }
          if (handlerOptions.panicThreshold === "all_errors" && rscResult.error) {
            throw rscResult.error;
          }
          
          // For other cases, continue to error handling to show a 500 response
          if(rscResult.error) {
            throw rscResult.error;
          }
        }
        activeStreams.add(res);
        res.on("close", () => {
          activeStreams.delete(res);
          activeControllers.delete(res);
        });
      } catch (error) {
        if(handlerOptions.panicThreshold === "all_errors" || PANIC_SYMBOL in {...error as any}) {
          throw error;
        }
        if(panicError != null) {
          throw panicError;
        }
        if(verbose) {
          logger.error(`[configureReactServer] Error: ${JSON.stringify(error)}`);
        }
        
        res.statusCode = 500;
        res.setHeader("Content-Type", "text/x-component; charset=utf-8");
        res.setHeader("Content-Length", "0"); // Will be updated after streaming

      }
    });
  };
