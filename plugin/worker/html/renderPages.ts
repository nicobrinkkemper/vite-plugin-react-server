import { mkdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve as resolvePath } from "node:path";
import { Transform } from "node:stream";
import type { Worker } from "node:worker_threads";
import { createHandler } from "../../react-server/createHandler.js";
import type { CheckFilesExistReturn, PageData, ResolvedUserConfig, ResolvedUserOptions } from "../../types.js";
import type {
  HtmlWorkerResponse,
  WorkerRscChunkMessage,
} from "../types.js";
import type { 
  Manifest, 
  Plugin, 
  IndexHtmlTransformHook, 
  IndexHtmlTransformContext,
  HtmlTagDescriptor
} from "vite";
import type { PluginContext } from "rollup";
import React from "react";
import { collectManifestClientFiles } from "../../collect-manifest-client-files.js";
import { cssFiles } from "../rsc/state.js";

interface PipeableStreamOptions {
  bootstrapModules?: string[];
  bootstrapScripts?: string[];
  bootstrapScriptContent?: string;
  signal?: AbortSignal;
  identifierPrefix?: string;
  namespaceURI?: string;
  nonce?: string;
  progressiveChunkSize?: number;
  onShellReady?: () => void;
  onAllReady?: () => void;
  onError?: (error: unknown) => void;
  importMap?: {
    imports?: Record<string, string>;
  };
}

interface PageAsset extends HtmlTagDescriptor {}

interface PageMetadata {
  title?: string;
  description?: string;
  // Add other meta tags as needed
}

type RenderPagesOptions = {
  pluginOptions: ResolvedUserOptions;
  userConfig: ResolvedUserConfig;
  clientManifest: Manifest;
  serverManifest: Manifest;
  worker: Worker;
  pipableStreamOptions?: PipeableStreamOptions;
  loader: (id: string) => Promise<Record<string, any>>;
  onCssFile?: (url: string, parentUrl: string) => void;
  onClientJSFile?: (url: string, parentUrl: string) => void;
  onPage?: (pageData: PageData) => Promise<void>;
  clientCss?: string[];
  moduleBasePath: string;
  moduleBaseURL: string;
  transformIndexHtml: IndexHtmlTransformHook;
};

export async function renderPages(
  pluginContext: PluginContext,
  routes: string[],
  files: CheckFilesExistReturn,
  options: RenderPagesOptions,
) {
  const root = pluginContext.environment.config.root;
  const failedRoutes = new Map<string, Error>();
  const completedRoutes = new Set<string>();
  const clientCss = options.clientCss ?? [];
  const partialPageData = new Map<string, Partial<PageData>>();

  const mergeAndSendPageData = async (route: string, resolve: () => void) => {
    const partial = partialPageData.get(route);
    if (!partial?.html || !partial.rsc) {
      return; // Wait for both parts
    }

    const pageData: PageData = {
      route,
      html: partial.html,
      rsc: partial.rsc
    };

    // Write RSC file
    if (options.pluginOptions.build.outDir) {
      const rscOutputPath = join(options.pluginOptions.build.outDir, options.pluginOptions.build.static, route, 'index.rsc');
      await mkdir(dirname(rscOutputPath), { recursive: true });
      await writeFile(rscOutputPath, partial.rsc.content);
    }

    // Write HTML file
    if (options.pluginOptions.build.outDir) {
      const htmlOutputPath = join(options.pluginOptions.build.outDir, options.pluginOptions.build.static, route, 'index.html');
      await mkdir(dirname(htmlOutputPath), { recursive: true });
      await writeFile(htmlOutputPath, partial.html.raw);
    }

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
                transformed: '', // Will be set by main thread transform
                assets: []
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
            console.error('Worker error for route:', msg.id, msg.error);
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
        console.error('No files found for route:', route);
        failedRoutes.set(route, new Error(`No files found for ${route}`));
        continue;
      }

      if(options.pipableStreamOptions?.importMap?.imports){
        for(let [key, value] of Object.entries(options.pipableStreamOptions?.importMap?.imports)){
          options.onClientJSFile?.(value, route);
        }
      }
      // Create handler for pure RSC output
      const rscResult = await createHandler(route, {
        ...options.pluginOptions,
        Html: React.Fragment // Use Fragment for pure RSC output
      }, {
        loader: options.loader,
        clientManifest: options.clientManifest,
        serverManifest: options.serverManifest,
        cssFiles: clientCss,
        pipableStreamOptions: {
          ...options.pipableStreamOptions,
          importMap: {
            imports: {
              ...options.pipableStreamOptions?.importMap?.imports,
            }
          }
        },
      });

      // Create handler for HTML output
      const htmlResult = await createHandler(route, options.pluginOptions, {
        loader: options.loader,
        clientManifest: options.clientManifest,
        serverManifest: options.serverManifest,
        cssFiles: clientCss,
        pipableStreamOptions: {
          ...options.pipableStreamOptions,
          importMap: {
            imports: {
              ...options.pipableStreamOptions?.importMap?.imports
            }
          }
        },
      });

      if (rscResult.type !== "success" || htmlResult.type !== "success") {
        if(rscResult.type !== "success"){ 
          if(rscResult.type !== "skip"){
            console.error('Handler failed for route:', route, rscResult.error);
          }
        }
        if(htmlResult.type !== "success"){
          if(htmlResult.type !== "skip"){
            console.error('Handler failed for route:', route, htmlResult.error);
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
                if(chunk) {
                  chunks.push(Buffer.from(chunk));
                  callback(null, chunk);
                }
              } catch (error) {
                callback(error as Error);
              }
            },
            async flush(callback) {
              try {
                const rscContent = Buffer.concat(chunks).toString('utf-8');

                // Update partial page data with raw RSC content
                const partial = partialPageData.get(route) || { route };
                partial.rsc = {
                  modules: [], // Will be parsed by the client
                  content: rscContent
                };
                partialPageData.set(route, partial);
                await mergeAndSendPageData(route, resolve);

                callback();
                resolve();
              } catch (error) {
                callback(error as Error);
                reject(error);
              }
            }
          });

          rscResult.stream.pipe(rscTransform);
        }),

        // Send HTML stream to worker
        new Promise<void>((resolve, reject) => {
          const htmlTransform = new Transform({
            transform(chunk, _encoding, callback) {
              try {
                options.worker.postMessage({
                  type: "RSC_CHUNK",
                  id: route,
                  chunk: chunk.toString(),
                  moduleRootPath: join(root, options.pluginOptions.build.outDir, options.pluginOptions.build.client),
                  moduleBaseURL: options.moduleBaseURL,
                  htmlOutputPath: join(options.pluginOptions.build.outDir, options.pluginOptions.build.static, route, 'index.html'),
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
            }
          });

          htmlResult.stream.pipe(htmlTransform);
        })
      ]);
    }

    await allRoutesComplete;

  } catch (error) {
    console.error('Render error:', error);
    throw error;
  }

  return { failedRoutes, completedRoutes };
}
