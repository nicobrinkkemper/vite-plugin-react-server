import type { Manifest, ViteDevServer } from "vite";
import type { ServerResponse } from "http";
import type {
  AutoDiscoveredFiles,
  InlineCssOpt,
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
import { logError } from "../error/toError.js";
import { handleServerAction } from "./handleServerAction.js";

export async function configureReactServer<
  T extends PagePropOpt = PagePropOpt,
  InlineCSS extends InlineCssOpt = InlineCssOpt
>({
  server,
  autoDiscoveredFiles,
  userOptions: _userOptions,
  serverManifest,
}: {
  server: ViteDevServer;
  autoDiscoveredFiles: AutoDiscoveredFiles;
  userOptions: ResolvedUserOptions<T, InlineCSS>;
  serverManifest: Manifest;
}) {
  const activeStreams = new Set<ServerResponse>();
  const {
    Html: _UserHtmlComponent,
    onEvent,
    // remove these
    ...handlerUserOptions
  } = _userOptions;
  const handlerOptions = {
    ...handlerUserOptions,
    moduleBaseURL: server.config.base,
    moduleBasePath: server.config.base,
    projectRoot: server.config.root,
    Html: React.Fragment,
    onEvent: createEventHandler(onEvent),
    css: handlerUserOptions.css
  };

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

      // first load the page and props
      const pageAndPropsResult = await resolvePageAndProps({
        pagePath,
        propsPath,
        route: info.route,
        loader: server.ssrLoadModule,
        pageExportName: handlerOptions.pageExportName ?? "default",
        propsExportName: handlerOptions.propsExportName ?? "default",
      });
      if (pageAndPropsResult.type === "error") {
        throw pageAndPropsResult.error;
      }
      if (pageAndPropsResult.type === "skip") {
        return next();
      }

      const eventHandler = createEventHandler(onEvent);
      const cssFilesResult = await collectViteModuleGraphCss({
        moduleGraph: server.moduleGraph, // by having loaded the page and props, we can get them from the module graph
        parentUrl: pagePath,
        handlerOptions: {
          pagePath,
          loader: server.ssrLoadModule,
          // explicitly set for development server
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
      // Create the headless RSC stream directly;
      const rscResult = createHandler({
        ...handlerOptions,
        PageComponent: PageComponent,
        pageProps: pageProps,
        logger: server.config.logger,
        loader: server.ssrLoadModule,
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
      activeStreams.add(res);
      res.on("close", () => {
        activeStreams.delete(res);
      });
    } catch (error) {
      logError(error, server.config.logger);
      res.end();
    }
  });
  // Listen for when the server actually starts
}
