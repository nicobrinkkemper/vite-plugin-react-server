import type {  Manifest, ViteDevServer } from "vite";
import type { ServerResponse } from "http";
import type { AutoDiscoveredFiles, ResolvedUserOptions } from "../types.js";
import { createEventHandler } from "../helpers/createEventHandler.js";
import { collectViteModuleGraphCss } from "../helpers/collectViteModuleGraphCss.js";
import { resolvePageAndProps } from "../helpers/resolvePageAndProps.js";
import { createHandler } from "../helpers/createHandler.js";
import React from "react";

export async function configureReactServer({
  server,
  autoDiscoveredFiles,
  userOptions,
  serverManifest,
}: {
  server: ViteDevServer;
  autoDiscoveredFiles: AutoDiscoveredFiles;
  userOptions: ResolvedUserOptions;
  serverManifest: Manifest;
}) {
  const activeStreams = new Set<ServerResponse>();

  // Handle Vite server restarts
  server.ws.on("restart", (path) => {
    console.log(
      "[vite-plugin-react-server] 🔧 Plugin changed, preparing for restart:",
      path
    );

    // Close streams with restart message
    for (const res of activeStreams) {
      res.writeHead(503, {
        "Content-Type": "text/x-component",
        "Retry-After": "1",
      });
      res.end('{"error":"Server restarting..."}');
    }
    activeStreams.clear();
  });

  server.middlewares.use(async (req, res, next) => {
    try {
      if (req.headers.accept !== "text/x-component") return next();
      let route = req.url?.replace('/'+userOptions.build.rscOutputPath, "");
      if (!route || route === "") {
        route = "/";
      }
      if (!autoDiscoveredFiles.urlMap.has(route)) {
        return next();
      }
      const routeFiles = autoDiscoveredFiles.urlMap.get(route)!;
      const pagePath = routeFiles.page;
      const propsPath = routeFiles.props;

      const {
        Html: _UserHtmlComponent,
        onEvent,
        // remove these
        moduleBaseURL,
        ...handlerUserOptions
      } = userOptions;
      // Create a unified event handler
      await server.warmupRequest(pagePath);
      const eventHandler = createEventHandler(onEvent);
      const cssFilesResult = await collectViteModuleGraphCss({
        moduleGraph: server.moduleGraph,
        pagePath,
        loader: (i)=>server.ssrLoadModule(i, {fixStacktrace: true}),
        // explicitly set to empty string, because we let vite handle the resolving during development
        moduleBaseURL: "",
        moduleBasePath: userOptions.moduleBasePath,
        moduleRootPath: userOptions.moduleRootPath,
        projectRoot: userOptions.projectRoot,
        css: userOptions.css,
        parentUrl: pagePath,
      });
      if (cssFilesResult.type === "skip") {
        return next();
      }
      if (cssFilesResult.type === "error") {
        throw cssFilesResult.error;
      }
      const pageAndPropsResult = await resolvePageAndProps({
        pagePath,
        propsPath,
        route,
        loader: server.ssrLoadModule,
        pageExportName: userOptions.pageExportName ?? "default",
        propsExportName: userOptions.propsExportName ?? "default",
      });
      if (pageAndPropsResult.type === "error") {
        throw pageAndPropsResult.error;
      }
      if (pageAndPropsResult.type === "skip") {
        return next();
      }
      const { PageComponent, pageProps } = pageAndPropsResult;
      // Create the headless RSC stream directly
      const rscResult = await createHandler({
        ...handlerUserOptions,
        PageComponent: PageComponent,
        pageProps: pageProps,
        logger: server.config.logger,
        loader: server.ssrLoadModule,
        Html: React.Fragment,
        onEvent: eventHandler,
        manifest: serverManifest,
        worker: server as any,
        route,
        pagePath,
        propsPath,
        cssFiles: cssFilesResult.cssFiles ?? new Map(),
        // explicitly set to empty string, because we let vite handle the resolving during development
        moduleBaseURL: "",
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
