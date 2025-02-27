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
  onCssFile?: (path: string) => void;
  clientCss?: string[];
  moduleBasePath: string;
  moduleBaseURL: string;
};

export async function renderPages(
  pluginContext: PluginContext,
  routes: string[],
  files: CheckFilesExistReturn,
  options: RenderPagesOptions
) {
  const root = pluginContext.environment.config.root;
  const outDir = pluginContext.environment.config.build.outDir;
  const failedRoutes = new Map<string, Error>();
  const completedRoutes = new Set<string>();
  const writePromises = new Map<string, Promise<void>>();

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

    // Process routes sequentially
    for (const route of routes) {
      const routeFiles = files.urlMap.get(route);
      if (!routeFiles) {
        console.error('No files found for route:', route);
        failedRoutes.set(route, new Error(`No files found for ${route}`));
        continue;
      }

      const cssFiles = collectManifestCss(
        options.serverManifest,
        options.moduleBasePath,
        routeFiles.page,
        options.onCssFile
      );

      const result = await createHandler(route, {
        ...options.pluginOptions,
        Html: React.Fragment
      }, {
        loader: options.loader,
        clientManifest: options.clientManifest,
        serverManifest: options.serverManifest,
        pipableStreamOptions: {
          ...options.pipableStreamOptions,
          importMap: {
            imports: {
              ...options.pipableStreamOptions?.importMap?.imports,
              ...Object.fromEntries(Array.from(cssFiles.entries()))
            }
          }
        },
      });

      if (result.type !== "success") {
        console.error('Handler failed for route:', result);
        failedRoutes.set(route, new Error(`Handler failed for ${route}`));
        continue;
      }

      // Process stream
      await new Promise<void>((resolve, reject) => {
        const transform = new Transform({
          transform(chunk, _encoding, callback) {
            options.worker.postMessage({
              type: "RSC_CHUNK",
              id: route,
              chunk: chunk.toString(),
              moduleRootPath: join(root, options.pluginOptions.build.outDir),
              moduleBaseURL: options.moduleBaseURL,
              htmlOutputPath: join(outDir, route, 'index.html'),
              pipableStreamOptions: options.pipableStreamOptions,
            });
            callback(null, chunk);
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

        result.stream.pipe(transform);
      });
    }

    await allRoutesComplete;

  } catch (error) {
    console.error('Render error:', error);
    throw error;
  }

  return { failedRoutes, completedRoutes };
}
