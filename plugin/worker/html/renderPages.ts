import { mkdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve as resolvePath } from "node:path";
import { Transform } from "node:stream";
import type { Worker } from "node:worker_threads";
import { createHandler } from "../../react-server/createHandler.js";
import type { CheckFilesExistReturn, ResolvedUserConfig, ResolvedUserOptions } from "../../types.js";
import type {
  HtmlWorkerResponse,
  WorkerRscChunkMessage,
} from "../types.js";
import type { Manifest } from "vite";
import type {
  PluginContext,
} from "rollup";
import React from "react";
import { collectManifestCss } from "../../collect-css-manifest.js";

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

type RenderPagesOptions = {
  pluginOptions: ResolvedUserOptions;
  userConfig: ResolvedUserConfig;
  clientManifest: Manifest;
  serverManifest: Manifest;
  worker: Worker;
  pipableStreamOptions?: PipeableStreamOptions;
  loader: (id: string) => Promise<Record<string, any>>;
  onCssFile?: (url: string, parentUrl: string) => void;
  clientCss?: string[];
  moduleBasePath: string;
  moduleBaseURL: string;
};

export async function renderPages(
  pluginContext: PluginContext,
  routes: string[],
  files: CheckFilesExistReturn,
  options: RenderPagesOptions,
) {
  const root = pluginContext.environment.config.root;
  const outDir = pluginContext.environment.config.build.outDir;
  const failedRoutes = new Map<string, Error>();
  const completedRoutes = new Set<string>();
  const writePromises = new Map<string, Promise<void>>();
  const clientCss = options.clientCss ?? [];
  try {
    // Set up worker message handling
    const allRoutesComplete = new Promise<void>((resolve, reject) => {
      options.worker.on("message", (msg: HtmlWorkerResponse) => {
        switch (msg.type) {
          case "ALL_READY": {
            const { id, html, outputPath } = msg;
            mkdirSync(dirname(outputPath), { recursive: true });
            
            writeFile(outputPath, html)
              .then(() => {
                completedRoutes.add(id);
                if (completedRoutes.size === routes.length) {
                  resolve();
                }
              })
              .catch((error) => {
                console.error('Write error for route:', id, error);
                failedRoutes.set(id, error as Error);
                reject(error);
              });
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

    collectManifestCss(
      options.clientManifest,
      options.moduleBasePath,
      'index.html',
      (url, parentUrl)=>{
        options?.onCssFile?.(url, parentUrl);
        if(!clientCss.includes(url)){
          clientCss.push(url);
        }
      },
      join(root, options.pluginOptions.build.outDir, options.pluginOptions.build.client)
    );

    // Process routes sequentially
    for (const route of routes) {
      const routeFiles = files.urlMap.get(route);
      if (!routeFiles) {
        console.error('No files found for route:', route);
        failedRoutes.set(route, new Error(`No files found for ${route}`));
        continue;
      }

      collectManifestCss(
        options.serverManifest,
        options.moduleBasePath,
        routeFiles.page,
        (url, parentUrl)=>{
          options.onCssFile?.(url, parentUrl);
          if(!clientCss.includes(url)){
            clientCss.push(url);
          }
        }
      );

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
        console.error('Handler failed for route:', route);
        failedRoutes.set(route, new Error(`Handler failed for ${route}`));
        continue;
      }

      // Process both streams
      await Promise.all([
        // Save RSC stream to .rsc file in client directory
        new Promise<void>((resolve, reject) => {
          const chunks: Buffer[] = [];
          const rscTransform = new Transform({
            transform(chunk, _encoding, callback) {
              try {
                chunks.push(Buffer.from(chunk));
                callback(null, chunk);
              } catch (error) {
                callback(error as Error);
              }
            },
            flush(callback) {
              try {
                const rscPath = join(options.pluginOptions.build.outDir, options.pluginOptions.build.client, route, 'index.rsc');
                
                // Ensure directory exists
                mkdirSync(dirname(rscPath), { recursive: true });
                
                // Write complete file
                writeFile(rscPath, Buffer.concat(chunks))
                  .then(() => {
                    callback();
                    resolve();
                  })
                  .catch(error => {
                    console.error('RSC write error:', error);
                    callback(error as Error);
                    reject(error);
                  });
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
                  htmlOutputPath: join(options.pluginOptions.build.outDir, options.pluginOptions.build.client, route, 'index.html'),
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
