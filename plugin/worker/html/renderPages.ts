import { join, resolve as resolvePath } from "node:path";
import { Transform } from "node:stream";
import type { Worker } from "node:worker_threads";
import type {
  WorkerRscChunkMessage,
} from "../types.js";
import { createHandler } from "../../react-server/createHandler.js";
import type { StreamPluginOptions } from "../../types.js";
import { mkdir, writeFile } from "node:fs/promises";

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
  outDir: string;
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
  console.log("[renderPages] Starting render for routes:", routes);

  const destinationRoot = resolvePath(options.pluginOptions.projectRoot, options.outDir);
  const failedRoutes = new Map<string, Error>();
  const moduleRootPath = join(destinationRoot, options.pluginOptions.moduleBasePath);
  const moduleBaseURL = options.pluginOptions.moduleBaseURL;
  const htmlRoot = resolvePath(
    options.pluginOptions.projectRoot,
    options.pluginOptions.build?.client ?? options.outDir
  );

  const streamStarted = new Set<string>();
  const completedRoutes = new Set<string>();
  const htmlContent = new Map<string, string>();
  const writePromises = new Map<string, Promise<void>>();

  // Create a promise that resolves when all routes are complete
  const allRoutesComplete = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Render timeout - Started: ${streamStarted.size}, Completed: ${completedRoutes.size}`));
    }, 5000);

    options.worker.on("message", function messageHandler(msg: any) {
      console.log("[renderPages] Raw message:", msg);
      switch (msg.type) {
        case "SHELL_READY": {
          console.log("[renderPages] Shell ready");
          streamStarted.add(msg.id);
          break;
        }
        case "HTML_READY": {
          console.log("[renderPages] HTML ready for", msg.id);
          htmlContent.set(msg.id, msg.html);
          break;
        }
        case "ALL_READY": {
          console.log("[renderPages] All streams ready");
          completedRoutes.add(msg.id);
          
          if (completedRoutes.size === routes.length) {
            options.worker.removeListener("message", messageHandler);
            clearTimeout(timeout);
            
            // Write all HTML files
            for (const [route, html] of htmlContent) {
              const outputPath = route === '/' 
                ? resolvePath(htmlRoot, 'index.html')
                : resolvePath(htmlRoot, route, 'index.html');
              
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
      console.log("[renderPages] Processing route:", route);
      
      try {
        const result = await createHandler(route, options.pluginOptions, {
          loader: options.loader,
          manifest: options.manifest,
        });

        if (result.type !== "success") {
          console.log("[renderPages] Handler failed:", result);
          return;
        }

        const htmlOutputPath = route === '/' 
          ? resolvePath(htmlRoot, 'index.html')
          : resolvePath(htmlRoot, route, 'index.html');

        const transform = new Transform({
          transform(chunk, _encoding, callback) {
            options.worker.postMessage({
              type: "RSC_CHUNK",
              id: route,
              chunk: chunk,
              moduleRootPath: moduleRootPath,
              moduleBaseURL: moduleBaseURL,
              htmlOutputPath,
              outDir: options.outDir,
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
        });
          
        result.stream.pipe(transform);

      } catch (error) {
        failedRoutes.set(route, error as Error);
      }
    });

    // Wait for both the render promises and all routes to complete
    await Promise.all([
      Promise.all(renderPromises),
      allRoutesComplete
    ]);

  } finally {
    await options.worker.terminate();
  }

  return {
    failedRoutes,
    completedRoutes
  };
}
