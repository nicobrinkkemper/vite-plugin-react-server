import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Transform } from "node:stream";
import type { Worker } from "node:worker_threads";
import { createHandler } from "../../helpers/createHandler.js";
import type {
  CheckFilesExistReturn,
  CreateHandlerOptions,
  PageData,
} from "../../types.js";
import type { HtmlWorkerResponse } from "../types.js";
import { type Manifest, type IndexHtmlTransformHook, createLogger } from "vite";
import React from "react";
import { collectManifestClientFiles } from "../../collect-manifest-client-files.js";

type RenderPagesOptions<T = any> = Omit<CreateHandlerOptions<T>, "url" | "route" | "getCss" | "propsPath" | "pagePath"> & {
  clientManifest: Manifest;
  serverManifest: Manifest;
  worker: Worker;
  loader: (id: string) => Promise<Record<string, any>>;
  onCssFile?: (url: string, parentUrl: string) => void;
  onClientJSFile?: (url: string, parentUrl: string) => void;
  onPage?: (pageData: PageData) => Promise<void>;
  clientCss?: string[];
  transformIndexHtml: IndexHtmlTransformHook;
  outDir: string;
  htmlOutputPath: string;
  server?: any;
  bundle?: any;
  chunk?: any;
  originalUrl?: string;
};

export async function renderPages<T = any>(
  routes: string[],
  files: CheckFilesExistReturn,
  options: RenderPagesOptions<T>
) {
  const failedRoutes = new Map<string, Error>();
  const completedRoutes = new Set<string>();
  const clientCss = options.clientCss ?? [];
  const partialPageData = new Map<string, Partial<PageData>>();
  const moduleRootPath =
    options.moduleBasePath !== "" &&
    !options.moduleRootPath.endsWith(options.moduleBasePath)
      ? join(options.moduleRootPath, options.moduleBasePath)
      : options.moduleRootPath;
  const mergeAndSendPageData = async (route: string, resolve: () => void) => {
    const partial = partialPageData.get(route);
    if (!partial?.html || !partial.rsc) {
      return; // Wait for both parts
    }

    const pageData: PageData = {
      route,
      html: partial.html,
      rsc: partial.rsc,
    };

    // Write RSC file
    console.log("route", route);
    // Write HTML file
    let routeHtmlPath =
      route === "/"
        ? options.htmlOutputPath
        : options.htmlOutputPath.replace(
            "index.html",
            join(route, "index.html")
          );
    if (routeHtmlPath.startsWith("/")) {
      routeHtmlPath = routeHtmlPath.slice(1);
    }
    const routeRscPath = routeHtmlPath.slice(0, -5) + ".rsc";
    await mkdir(dirname(routeHtmlPath), { recursive: true });
    await writeFile(routeRscPath, partial.rsc.content);
    await writeFile(routeHtmlPath, partial.html.raw);

    await options.onPage?.(pageData);
    completedRoutes.add(route);
    if (completedRoutes.size === routes.length) {
      resolve();
    }
  };

  try {
    // Set up worker message handling
    const allRoutesComplete = new Promise<void>((resolve, reject) => {
      options.worker.on("message", async (msg: HtmlWorkerResponse) => {
        switch (msg.type) {
          case "ALL_READY": {
            const { id, html } = msg;
            try {
              const partial = partialPageData.get(id) || { route: id };

              partial.html = {
                raw: html,
                transformed:
                  typeof options.transformIndexHtml === "function"
                    ? String(await options.transformIndexHtml(id, {
                        path: id,
                        filename: join(id, "index.html"),
                      }) || "")
                    : "", // Will be set by main thread transform
                assets: [],
              };
              partialPageData.set(id, partial);
              await mergeAndSendPageData(id, resolve);
            } catch (error) {
              failedRoutes.set(id, error as Error);
              reject(error);
            }
            break;
          }
          case "ERROR": {
            console.error("Worker error for route:", msg.id, msg.error);
            failedRoutes.set(msg.id, new Error(msg.error));
            reject(new Error(msg.error));
            break;
          }
        }
      });
    });

    // Process routes sequentially
    for (const route of routes) {
      const routeFiles = files.urlMap.get(route);
      if (!routeFiles) {
        console.error("No files found for route:", route);
        failedRoutes.set(route, new Error(`No files found for ${route}`));
        continue;
      }

      if (options.pipableStreamOptions?.importMap?.imports) {
        for (let [, value] of Object.entries(
          options.pipableStreamOptions?.importMap?.imports
        )) {
          options.onClientJSFile?.(value, route);
        }
      }
      const getCss = (id: string) => {
        const cssFiles = collectManifestClientFiles({
          manifest: options.serverManifest,
          root: options.root,
          pagePath: id,
        }).cssFiles;
        return cssFiles;
      }
      const pagePath = files.urlMap.get(route)?.page;
      const propsPath = files.urlMap.get(route)?.props;
      if(!pagePath){
        throw new Error(`No page path found for ${route}`);
      }
      // Create handler for pure RSC output
      const rscResult = await createHandler({
        root: options.root,
        url: route,
        route: route,
        getCss: getCss,
        loader: options.loader,
        cssFiles: clientCss,
        moduleBase: options.moduleBase,
        moduleBasePath: options.moduleBasePath,
        moduleRootPath: moduleRootPath,
        moduleBaseURL: options.moduleBaseURL,
        pipableStreamOptions: options.pipableStreamOptions ?? {},
        inlineCss: options.inlineCss,
        Html: React.Fragment,
        CssCollector: options.CssCollector,
        pagePath: pagePath,
        propsPath: propsPath,
        pageExportName: options.pageExportName,
        propsExportName: options.propsExportName,
        logger: createLogger(),
      });
      // Create handler for HTML output
      const htmlResult = await createHandler({
        root: options.root,
        url: route,
        route: route,
        getCss: getCss,
        loader: options.loader,
        cssFiles: clientCss,
        moduleBase: options.moduleBase,
        moduleBasePath: options.moduleBasePath,
        moduleRootPath: moduleRootPath,
        moduleBaseURL: options.moduleBaseURL,
        pipableStreamOptions: options.pipableStreamOptions,
        inlineCss: options.inlineCss,
        Html: options.Html,
        CssCollector: options.CssCollector,
        pagePath: pagePath,
        propsPath: propsPath,
        pageExportName: options.pageExportName,
        propsExportName: options.propsExportName,
        logger: createLogger(),
      });

      if (rscResult.type !== "success" || htmlResult.type !== "success") {
        if (rscResult.type !== "success") {
          if (rscResult.type !== "skip") {
            console.error("Handler failed for route:", route, rscResult.error);
          }
        }
        if (htmlResult.type !== "success") {
          if (htmlResult.type !== "skip") {
            console.error("Handler failed for route:", route, htmlResult.error);
          }
        }
        failedRoutes.set(route, new Error(`Handler failed for ${route}`));
        continue;
      }

      // Process both streams
      await Promise.all([
        // Handle RSC stream
        new Promise<void>((resolve, reject) => {
          const chunks: Buffer[] = [];
          const rscTransform = new Transform({
            transform(chunk, _encoding, callback) {
              try {
                if (chunk) {
                  chunks.push(Buffer.from(chunk));
                  callback(null, chunk);
                }
              } catch (error) {
                callback(error as Error);
              }
            },
            async flush(callback) {
              try {
                const rscContent = Buffer.concat(chunks).toString("utf-8");

                // Update partial page data with raw RSC content
                const partial = partialPageData.get(route) || { route };
                partial.rsc = {
                  modules: [], // Will be parsed by the client
                  content: rscContent,
                };
                partialPageData.set(route, partial);
                await mergeAndSendPageData(route, resolve);

                callback();
                resolve();
              } catch (error) {
                callback(error as Error);
                reject(error);
              }
            },
          });

          rscResult.stream.pipe(rscTransform);
        }),

        // Send HTML stream to worker
        new Promise<void>((resolve) => {
          const htmlTransform = new Transform({
            transform(chunk, _encoding, callback) {
              try {
                options.worker.postMessage({
                  type: "RSC_CHUNK",
                  id: route,
                  chunk: chunk.toString(),
                  moduleRootPath: moduleRootPath,
                  moduleBaseURL: options.moduleBaseURL,
                  htmlOutputPath: options.htmlOutputPath,
                  pipableStreamOptions: options.pipableStreamOptions,
                });
                callback(null, chunk);
              } catch (error) {
                callback(error as Error);
              }
            },
            flush(callback) {
              options.worker.postMessage({
                type: "RSC_END",
                id: route,
              });
              callback();
              resolve();
            },
          });

          htmlResult.stream.pipe(htmlTransform);
        }),
      ]);
    }

    await allRoutesComplete;
  } catch (error) {
    console.error("Render error:", error);
    throw error;
  }

  return { failedRoutes, completedRoutes };
}
