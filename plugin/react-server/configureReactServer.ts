import type { Manifest, ViteDevServer } from "vite";
import type { ServerResponse } from "http";
import type {
  AutoDiscoveredFiles,
  InlineCssOpt,
  ModuleLoader,
  PagePropOpt,
  ResolvedUserOptions,
} from "../types.js";
import { createEventHandler } from "../helpers/createEventHandler.js";
import { collectViteModuleGraphCss } from "../helpers/collectViteModuleGraphCss.js";
import { resolvePageAndProps } from "../helpers/resolvePageAndProps.js";
import { createHandler } from "../helpers/createHandler.js";
import React from "react";
import { requestInfo } from "../helpers/requestInfo.js";
import { getRouteFiles } from "../helpers/getRouteFiles.js";
import { logError } from "../error/logError.js";
import { handleServerAction } from "./handleServerAction.js";
import { ReactDOMServer } from "../vendor/vendor.server.js";

export async function configureReactServer<
  T extends PagePropOpt = PagePropOpt,
  InlineCSS extends InlineCssOpt = InlineCssOpt,
  N1 extends string = "Page",
  N2 extends string = "props"
>({
  server,
  autoDiscoveredFiles,
  userOptions: _userOptions,
  serverManifest,
}: {
  server: ViteDevServer;
  autoDiscoveredFiles: AutoDiscoveredFiles;
  userOptions: ResolvedUserOptions<T, InlineCSS, N1, N2>;
  serverManifest: Manifest;
}) {
  const activeStreams = new Set<ServerResponse>();
  const {
    Html: _UserHtmlComponent,
    onEvent,
    ...handlerUserOptions
  } = _userOptions;
  const handlerOptions = {
    ...handlerUserOptions,
    moduleBaseURL: server.config.base,
    moduleBasePath: server.config.base,
    projectRoot: server.config.root,
    Html: React.Fragment,
    onEvent: createEventHandler(onEvent),
    css: handlerUserOptions.css,
  } as ResolvedUserOptions<T, InlineCSS, N1, N2>;

  // Set environment-specific configuration
  const define = {
    ...server.config.define,
    "process.env.NODE_ENV": JSON.stringify(
      process.env["NODE_ENV"] || "development"
    ),
  };
  server.config = {
    ...server.config,
    define,
  };

  // Handle Vite server restarts
  server.ws.on("restart", (path) => {
    server.config.logger.info(
      "[vite-plugin-react-server] 🔧 Plugin changed, preparing for restart:",
      path
    );

    // Close streams with restart message
    for (const res of activeStreams) {
      res.writeHead(503, {
        "Content-Type": "text/x-component; charset=utf-8",
        "Retry-After": "1",
      });
      res.end(
        `0:E{"digest":"","name":"Error","message":"Server restarting...","stack":"","env":"Server"}`
      );
    }
    activeStreams.clear();
  });
  const loader = (async (id) => {
    const [moduleID, exportName] = id.split("#");
    const result = await server.ssrLoadModule(moduleID);
    if (!result) {
      return {};
    }
    if (exportName && !(exportName in result)) {
      throw new Error(`Module ${moduleID} does not have export ${exportName}`);
    }
    return result;
  }) as ModuleLoader<T, N1, N2>;

  server.middlewares.use(async (req, res, next) => {
    if (!req.url) {
      return next();
    }
    const info = requestInfo(req, handlerOptions, "", server.config.logger);

    // Handle server actions
    if (info.isServerActionRequest) {
      return handleServerAction(req, res, server, handlerOptions);
    }
    if (!info.isRscRequest) return next();
    try {
      const routeFiles = await getRouteFiles(
        info.route,
        autoDiscoveredFiles,
        handlerOptions
      );
      if (routeFiles.type === "error") {
        server.config.logger.error(routeFiles.error.message);
        return next();
      }
      const pagePath = routeFiles.page;
      const propsPath = routeFiles.props;

      // First load the page and props
      const pageAndPropsResult = await resolvePageAndProps({
        pagePath,
        propsPath,
        route: info.route,
        loader: loader,
        pageExportName: handlerOptions.pageExportName ?? "Page",
        propsExportName: handlerOptions.propsExportName ?? "props",
      });
      if (pageAndPropsResult.type === "error") {
        throw pageAndPropsResult.error;
      }
      if (pageAndPropsResult.type === "skip") {
        return next();
      }

      const eventHandler = createEventHandler(onEvent);
      const cssFilesResult = await collectViteModuleGraphCss({
        moduleGraph: server.moduleGraph,
        parentUrl: pagePath,
        handlerOptions: {
          pagePath,
          loader: loader,
          ...handlerOptions,
        },
      });
      if (cssFilesResult.type === "skip") {
        return next();
      }
      if (cssFilesResult.type === "error") {
        throw cssFilesResult.error;
      }
      const { PageComponent, pageProps } = pageAndPropsResult;
      // Create the headless RSC stream directly
      const rscResult = createHandler({
        ...handlerOptions,
        PageComponent: PageComponent,
        pageProps: pageProps,
        logger: server.config.logger, 
        loader: loader,
        Html: React.Fragment,
        onEvent: eventHandler,
        manifest: serverManifest,
        server,
        route: info.route,
        pagePath,
        propsPath,
        cssFiles: cssFilesResult.cssFiles ?? new Map(),
        globalCss: new Map(),
      });

      if (rscResult.type === "success") {
        // set headers
        res.setHeader("Content-Type", "text/x-component; charset=utf-8");
        rscResult.stream!.pipe(res);
      }
      console.log("CREATED HANDLER");
      activeStreams.add(res);
      res.on("close", () => {
        activeStreams.delete(res);
      });
    } catch (error) {
      logError(error, server.config.logger);
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/x-component; charset=utf-8");
      res.setHeader("Content-Length", "0"); // Will be updated after streaming

      const { pipe } = ReactDOMServer.renderToPipeableStream(
        {
          type: "error",
          error: {
            digest: error instanceof Error ? error.message : String(error),
            name: error instanceof Error ? error.name : "Error",
          },
        },
        handlerOptions.moduleBasePath,
        {
          onError(error: Error) {
            logError(error, server.config.logger);
            res.statusCode = 500;
            res.end();
          },
          onAllReady() {
            // Update content length after streaming is complete
            const contentLength = res.getHeader("Content-Length");
            if (contentLength) {
              res.setHeader("Content-Length", contentLength);
            }
          },
        }
      );
      pipe(res);
    }
  });
}
