import type { Manifest, ViteDevServer } from "vite";
import type { ServerResponse } from "http";
import type { AutoDiscoveredFiles, ResolvedUserOptions } from "../types.js";
import { createEventHandler } from "../helpers/createEventHandler.js";
import { collectViteModuleGraphCss } from "../helpers/collectViteModuleGraphCss.js";
import { resolvePageAndProps } from "../helpers/resolvePageAndProps.js";
import { createHandler } from "../helpers/createHandler.js";
import React from "react";
import { requestInfo } from "../helpers/requestInfo.js";

export async function configureReactServer({
  server,
  autoDiscoveredFiles,
  userOptions: _userOptions,
  serverManifest,
}: {
  server: ViteDevServer;
  autoDiscoveredFiles: AutoDiscoveredFiles;
  userOptions: ResolvedUserOptions;
  serverManifest: Manifest;
}) {
  const activeStreams = new Set<ServerResponse>();

  const {
    Html: _UserHtmlComponent,
    onEvent,
    // remove these
    moduleBaseURL: _moduleBaseURL,
    moduleBasePath: _moduleBasePath,
    projectRoot: _projectRoot,
    ...handlerUserOptions
  } = _userOptions;

  const handlerOptions = Object.assign({}, handlerUserOptions, {
    moduleBaseURL: server.config.base,
    moduleBasePath: _moduleBasePath,
    projectRoot: server.config.root,
  });
  // Handle Vite server restarts
  server.ws.on("restart", (path) => {
    server.config.logger.info(
      "[vite-plugin-react-server] 🔧 Plugin changed, preparing for restart:",
      path
    );

    // Close streams with restart message
    for (const res of activeStreams) {
      res.writeHead(503, {
        "Content-Type": "text/x-component",
        "Retry-After": "1",
      });
      res.end(`0:E{"digest":"","name":"Error","message":"Server restarting...","stack":"","env":"Server"}`);
    }
    activeStreams.clear();
  });

  server.middlewares.use(async (req, res, next) => {
    if(!req.url) {
      return next();
    }
    const info = requestInfo(req, handlerOptions, "");
    if (!info.isRscRequest) return next();
    try {
      if (!autoDiscoveredFiles.urlMap.has(info.route)) {
        return next();
      }
      const routeFiles = autoDiscoveredFiles.urlMap.get(info.route)!;
      const pagePath = routeFiles.page;
      const propsPath = routeFiles.props;
      const port = server.config.server.port ?? 5173;
      const host = server.config.server.host ?? 'localhost';
      const protocol = server.config.server.https ? 'https' : 'http'; 
      process.env['VITE_BASE_URL'] = `${server.config.base}${server.config.base.endsWith('/') ? '' : '/'}`;
      process.env['VITE_PUBLIC_ORIGIN'] = `${protocol}://${host}:${port}`;
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
      const rscResult = await createHandler({
        ...handlerOptions,
        PageComponent: PageComponent,
        pageProps: pageProps,
        logger: server.config.logger,
        loader: server.ssrLoadModule,
        Html: React.Fragment,
        onEvent: eventHandler,
        manifest: serverManifest,
        worker: server as any,
        route: info.route,
        pagePath,
        propsPath,
        cssFiles: cssFilesResult.cssFiles ?? new Map(),
        globalCss: new Map(),
      });
      if (rscResult.type === "success") {
        rscResult.stream!.pipe(res);
      }
      activeStreams.add(res);
      res.on("close", () => {
        activeStreams.delete(res);
      });
    } catch (error) {
      res.end();
    }
  });
}
