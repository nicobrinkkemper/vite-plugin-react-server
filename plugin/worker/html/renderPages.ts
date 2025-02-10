import { mkdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve as resolvePath } from "node:path";
import { Transform } from "node:stream";
import type { Worker } from "node:worker_threads";
import { createHandler } from "../../react-server/createHandler.js";
import type { ResolvedUserConfig, StreamPluginOptions } from "../../types.js";

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
  pluginOptions: Required<
    Pick<
      StreamPluginOptions,
      "moduleBase" | "moduleBasePath" | "moduleBaseURL" | "projectRoot"
    >
  > &
    Pick<
      StreamPluginOptions,
      "Page" | "props" | "build" | "Html" | "pageExportName" | "propsExportName"
    >;
  userConfig: ResolvedUserConfig;
  manifest: Record<string, { file: string }>;
  worker: Worker;
  pipableStreamOptions?: PipeableStreamOptions;
  loader: (id: string) => Promise<Record<string, any>>;
  onCssFile?: (path: string) => void;
  clientCss?: string[];
  moduleBasePath: string;
  moduleBaseURL: string;
};

export async function renderPages(
  routes: string[],
  options: RenderPagesOptions
) {
  const destinationRoot = resolvePath(options.userConfig.root, options.userConfig.build.outDir);
  const failedRoutes = new Map<string, Error>();
  const moduleRootPath = join(destinationRoot, options.moduleBasePath);
  const moduleBaseURL = options.moduleBaseURL;
  const htmlRoot = join(
    options.userConfig.root,
    options.userConfig.build.outDir
  );
  const streamStarted = new Set<string>();
  const completedRoutes = new Set<string>();
  const htmlContent = new Map<string, string>();
  const writePromises = new Map<string, Promise<void>>();
  const transforms = new Map<string, Transform>();

  // Create a promise that resolves when all routes are complete
  const allRoutesComplete = new Promise<void>((resolve, reject) => {


    options.worker.on("message", function messageHandler(msg: any) {
      switch (msg.type) {
        case "SHELL_READY": {
          streamStarted.add(msg.id);
          break;
        }
        case "ALL_READY": {
          completedRoutes.add(msg.id);
          htmlContent.set(msg.id, msg.html);
          if (completedRoutes.size === routes.length) {
            options.worker.removeListener("message", messageHandler);
            
            // Write all HTML files
            for (const [route, html] of htmlContent) {
              const outputPath = route === '/' 
                ? join(htmlRoot, 'index.html')
                : join(htmlRoot, route, 'index.html');
              mkdirSync(dirname(outputPath), { recursive: true });
              const writePromise = writeFile(outputPath, html)
                .catch(error => {
                  failedRoutes.set(route, error as Error);
                });
              writePromises.set(route, writePromise);
            }

            // Wait for all files to be written
            Promise.all(writePromises.values())
              .then(() => resolve())
              .catch(reject);
          }
          break;
        }
        case "ERROR": {
          console.error("[renderPages] Worker error:", msg.error);
          if (msg.id) {
            failedRoutes.set(msg.id, new Error(msg.error));
          }
          break;
        }
      }
    });
  });

  try {
    await mkdir(htmlRoot, { recursive: true });

    const renderPromises = routes.map(async (route) => {
      
      try {
        const result = await createHandler(route, options.pluginOptions, {
          loader: options.loader,
          manifest: options.manifest,
          pipableStreamOptions: {
            importMap: {
              imports: {
                "react": "https://esm.sh/react@19.1.0-canary-8759c5c8-20250207",
                "react-dom": "https://esm.sh/react-dom@19.1.0-canary-8759c5c8-20250207",
              }
            }
          }
        });

        if (result.type !== "success") {
          console.error(`Failed to handle route ${route}:`, result);
          failedRoutes.set(route, new Error(`Handler failed for ${route}`));
          return;
        }

        const htmlOutputPath = route === '/' 
          ? resolvePath(htmlRoot, 'index.html')
          : resolvePath(htmlRoot, route, 'index.html');

        transforms.set(route, new Transform({
          transform(chunk, _encoding, callback) {
            options.worker.postMessage({
              type: "RSC_CHUNK",
              id: route,
              chunk: chunk,
              moduleRootPath: moduleRootPath,
              moduleBaseURL: moduleBaseURL,
              htmlOutputPath,
              outDir: options.userConfig.build.outDir,
              pipableStreamOptions: options.pipableStreamOptions ?? {},
            });
            callback(null, chunk);
          },
          flush(callback) {
            options.worker.postMessage({
              type: "RSC_END",
              id: route,
            });
            callback();
          }
        }));
          
        result.stream.pipe(transforms.get(route) as Transform);
        await new Promise(resolve => {
          transforms.get(route)?.on('finish', resolve);
        });

      } catch (error) {
        console.error(`Error processing route ${route}:`, error);
        failedRoutes.set(route, error as Error);
      }
    });

    // Wait for both the render promises and all routes to complete
    await Promise.all([
      Promise.all(renderPromises),
      allRoutesComplete
    ]);

  } finally {
    // Clean up all transform streams first
    for (const transform of transforms.values()) {
      transform.destroy();
    }
    transforms.clear();

    // Wait for all writes to complete before terminating worker
    await Promise.all(writePromises.values());
    await options.worker.terminate();
  }

  return {
    failedRoutes,
    completedRoutes
  };
}
