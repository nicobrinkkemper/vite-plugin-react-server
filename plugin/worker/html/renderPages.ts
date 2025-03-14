import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Transform } from "node:stream";
import type { Worker } from "node:worker_threads";
import { createHandler } from "../../helpers/createHandler.js";
import type {
  CheckFilesExistReturn,
  CreateHandlerOptions,
  PageData,
  CssContent,
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

const cssCache = new Map<string, Map<string, string | CssContent>>();
const processedRoutes = new Set<string>();

export async function renderPages<T = any>(
  routes: string[],
  files: CheckFilesExistReturn,
  options: RenderPagesOptions<T>
) {
  console.log(`Starting to render ${routes.length} routes${options.inlineCss ? ' with CSS inlining' : ''}`);
  const failedRoutes = new Map<string, Error>();
  const completedRoutes = new Set<string>();
  const clientCss = options.clientCss ?? [];
  const partialPageData = new Map<string, Partial<PageData>>();
  const remainingRoutes = new Set(routes);
  const moduleRootPath =
    options.moduleBasePath !== "" &&
    !options.moduleRootPath.endsWith(options.moduleBasePath)
      ? join(options.moduleRootPath, options.moduleBasePath)
      : options.moduleRootPath;

  // Set up worker message handling
  options.worker.on("message", async (msg: HtmlWorkerResponse) => {
    console.log(`Received worker message of type: ${msg.type}`);
    switch (msg.type) {
      case "ALL_READY": {
        const { id, html } = msg;
        console.log(`Processing ALL_READY for route: ${id}`);
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
                : "",
            assets: [],
          };
          partialPageData.set(id, partial);
          await mergeAndSendPageData(id);
        } catch (error) {
          console.error(`Error processing ALL_READY for route ${id}:`, error);
          failedRoutes.set(id, error as Error);
        }
        break;
      }
      case "ERROR": {
        console.error("Worker error for route:", msg.id, msg.error);
        failedRoutes.set(msg.id, new Error(msg.error));
        break;
      }
    }
  });

  const mergeAndSendPageData = async (route: string) => {
    console.log(`Attempting to merge and send data for route: ${route}`);
    const partial = partialPageData.get(route);
    if (!partial?.html || !partial.rsc) {
      console.log(`Waiting for complete data for route ${route}. Has HTML: ${!!partial?.html}, Has RSC: ${!!partial?.rsc}`);
      return;
    }

    console.log(`Processing complete data for route: ${route}`);
    const pageData: PageData = {
      route,
      html: partial.html,
      rsc: partial.rsc,
    };

    try {
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
      remainingRoutes.delete(route);
    } catch (error) {
      console.error(`Error writing files for route ${route}:`, error);
      failedRoutes.set(route, error as Error);
      remainingRoutes.delete(route);
    }
  };

  const getCss = async (id: string) => {
    console.log(`GetCSS called for route: ${id}`);
    if (processedRoutes.has(id)) {
      console.log(`Using cached CSS for route: ${id}`);
      return cssCache.get(id) || new Map();
    }

    const { cssFiles } = collectManifestClientFiles({
      manifest: options.serverManifest,
      root: options.root,
      pagePath: id,
    });

    console.log(`Found ${cssFiles.size} CSS files for route ${id}`);
    
    if (cssFiles.size === 0) {
      processedRoutes.add(id);
      cssCache.set(id, new Map());
      console.log(`GetCSS returned empty map for route: ${id}`);
      return new Map();
    }

    const transformedCssFiles = new Map<string, string | CssContent>();
    
    try {
      console.log(`Processing CSS files for route ${id}...`);
      // Process CSS files in sequence to avoid memory pressure
      for (const [cssPath, cssId] of cssFiles.entries()) {
        // Check global cache first
        for (const [cachedRoute, cache] of cssCache) {
          if (cache.has(cssId)) {
            console.log(`Reusing CSS from route ${cachedRoute} for ${cssPath}`);
            transformedCssFiles.set(cssPath, cache.get(cssId)!);
            continue;
          }
        }
        
        try {
          const filePath = join(options.moduleRootPath, cssPath);
          const content = await readFile(filePath, 'utf-8');
          const cssContent = {
            type: 'text/css',
            content,
            path: cssPath
          };
          console.log(`Css: ${filePath}`, cssContent);
          transformedCssFiles.set(cssPath, cssContent);
          
          // Clear references to help with garbage collection
          if (cssCache.size > 10) {
            const oldestRoute = Array.from(cssCache.keys())[0];
            cssCache.delete(oldestRoute);
            console.log(`Cleared CSS cache for route: ${oldestRoute}`);
          }
        } catch (error) {
          console.error(`Failed to read CSS file ${cssPath}:`, error);
        }
      }

      processedRoutes.add(id);
      cssCache.set(id, transformedCssFiles);
      console.log(`Completed CSS processing for route ${id}`);
      
      // Clear processed routes more aggressively
      if (processedRoutes.size > 20) {
        const oldestRoute = Array.from(processedRoutes)[0];
        processedRoutes.delete(oldestRoute);
        console.log(`Cleared processed route: ${oldestRoute}`);
      }
      
    } catch (error) {
      console.error(`Error processing CSS for route ${id}:`, error);
      processedRoutes.add(id);
      cssCache.set(id, new Map());
    }

    return transformedCssFiles;
  };

  // Process routes sequentially
  for (const route of routes) {
    console.log(`\nProcessing route: ${route}`);
    try {
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

      console.log(`Creating handlers for route: ${route}`);
      const pagePath = files.urlMap.get(route)?.page;
      const propsPath = files.urlMap.get(route)?.props;
      if(!pagePath){
        throw new Error(`No page path found for ${route}`);
      }

      console.log(`Creating RSC handler for route: ${route}`);
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

      console.log(`Creating HTML handler for route: ${route}`);
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

      console.log(`Processing streams for route: ${route}`);
      await new Promise<void>((resolve, reject) => {
        console.log(`Starting RSC stream processing for route: ${route}`);
        const chunks: Buffer[] = [];
        const rscTransform = new Transform({
          transform(chunk, _encoding, callback) {
            try {
              if (chunk) {
                console.log(`Received RSC chunk for route ${route}, size: ${chunk.length}`);
                const buf = Buffer.from(chunk);
                console.log(`Buffer size: ${buf.length}`);
                chunks.push(buf);
                callback(null, chunk);
              } else {
                console.log(`Received empty chunk for route ${route}`);
                callback();
              }
            } catch (error) {
              console.error(`Error in RSC transform for route ${route}:`, error);
              callback(error as Error);
            }
          },
          flush(callback) {
            console.log(`Flushing RSC stream for route: ${route}, total chunks: ${chunks.length}`);
            try {
              if (chunks.length === 0) {
                throw new Error(`No chunks received for route ${route}`);
              }
              const rscContent = Buffer.concat(chunks).toString("utf-8");
              if (!rscContent) {
                throw new Error(`Empty RSC content for route ${route}`);
              }
              console.log(`RSC content length for route ${route}: ${rscContent.length}`);
              const partial = partialPageData.get(route) || { route };
              partial.rsc = {
                modules: [],
                content: rscContent,
              };
              partialPageData.set(route, partial);
              console.log(`Stored RSC data for route ${route}`);
              callback();
              resolve();
            } catch (error) {
              console.error(`Error in RSC flush for route ${route}:`, error);
              callback(error as Error);
              reject(error);
            }
          },
        });

        rscResult.stream.pipe(rscTransform);
      });

      // Wait for HTML stream after RSC is done
      await new Promise<void>((resolve, reject) => {
        console.log(`Starting HTML stream processing for route: ${route}`);
        const htmlTransform = new Transform({
          async transform(chunk, _encoding, callback) {
            try {
              console.log(`Processing chunk for route ${route}, type: ${typeof chunk}, isBuffer: ${Buffer.isBuffer(chunk)}`);
              
              // Use the chunk directly if it's already a Buffer, otherwise create a new one
              const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
              console.log(`Using buffer of size ${buffer.length}, has buffer property: ${!!buffer.buffer}`);
              
              // Create a new message object with the buffer
              const message = {
                type: "RSC_CHUNK",
                id: route,
                chunk: new Blob([buffer], { type: 'application/octet-stream' }),
                moduleRootPath: moduleRootPath,
                moduleBaseURL: options.moduleBaseURL,
                htmlOutputPath: options.htmlOutputPath,
                pipableStreamOptions: options.pipableStreamOptions,
                clientManifest: options.clientManifest,
                serverManifest: options.serverManifest,
              };

              // Get the ArrayBuffer from the Blob and send the message
              const arrayBuffer = await message.chunk.arrayBuffer();
              options.worker.postMessage(message, [arrayBuffer]);
              
              // Wait for chunk processing feedback before continuing
              const messageHandler = (msg: HtmlWorkerResponse) => {
                if (msg.type === "CHUNK_PROCESSED" && msg.id === route) {
                  options.worker.off("message", messageHandler);
                  callback(null, chunk);
                } else if (msg.type === "CHUNK_ERROR" && msg.id === route) {
                  options.worker.off("message", messageHandler);
                  callback(new Error(msg.error));
                }
              };
              options.worker.on("message", messageHandler);
            } catch (error) {
              console.error(`Error processing chunk for route ${route}:`, error);
              callback(error instanceof Error ? error : new Error(String(error)));
            }
          },
          flush(callback) {
            console.log(`Flushing HTML stream for route: ${route}`);
            // Send end message and wait for worker to process it
            options.worker.postMessage({
              type: "RSC_END",
              id: route,
            });
            
            // Wait for ALL_READY message before resolving
            const messageHandler = (msg: HtmlWorkerResponse) => {
              if (msg.type === "ALL_READY" && msg.id === route) {
                options.worker.off("message", messageHandler);
                callback();
                resolve();
              } else if (msg.type === "ERROR" && msg.id === route) {
                options.worker.off("message", messageHandler);
                callback(new Error(msg.error));
                reject(new Error(msg.error));
              }
            };
            options.worker.on("message", messageHandler);
          }
        });

        htmlResult.stream.pipe(htmlTransform);
      });

      // Clear data for this route after both streams are done
      partialPageData.delete(route);
      
      // Small delay between routes
      await new Promise(resolve => setTimeout(resolve, 50));
      
    } catch (error) {
      console.error(`Error processing route ${route}:`, error);
      failedRoutes.set(route, error as Error);
    }
  }

  return { failedRoutes, completedRoutes };
}
