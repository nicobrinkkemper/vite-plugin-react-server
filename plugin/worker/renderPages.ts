import { join, resolve as resolvePath } from "node:path";
import { Transform } from "node:stream";
import type { Worker } from "node:worker_threads";
import type {
  WorkerRscChunkMessage,
  RscEndMessage,
} from "./types.js";
import { createHandler } from "../react-server/createHandler.js";
import type { StreamPluginOptions } from "../types.js";

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

  const destinationRoot = resolvePath(
    options.pluginOptions.projectRoot,
    options.outDir
  );
  const failedRoutes = new Map<string, Error>();
  const moduleBasePath = join(
    destinationRoot,
    options.pluginOptions.moduleBasePath
  );
  const moduleBaseURL = options.pluginOptions.moduleBaseURL;

  const htmlRoot = resolvePath(
    options.pluginOptions.projectRoot,
    options.pluginOptions.build?.client ?? options.outDir
  );
  const filesOutputted: string[] = [];
  const renderPromises: Promise<void>[] = [];

  // Set up message handler
  options.worker.on("message", (msg) => {
    console.log("[renderPages] Raw message:", msg);
    switch (msg.type) {
      case "ERROR":
        console.error("[RenderPages] Worker error:", msg.error);
        break;
      case "WROTE_FILE":
        filesOutputted.push(msg.outputPath);
        if (filesOutputted.length === routes.length) {
          renderPromises.push(
            new Promise<void>((resolve) => {
              options.worker.removeAllListeners();
              options.worker.terminate();
              resolve();
            })
          );
        }
        break;
      default:
        break;
    }
  });

  try {
    const completedRoutes = new Set<string>();

    // Create completion promise that resolves when all streams end
    const allStreamsComplete = new Promise<void>((resolve) => {
      console.log("[renderPages] Setting up message handler");
      const messageHandler = (msg: any) => {
        console.log("[renderPages] Raw message:", msg);
        if (msg.type === "WROTE_FILE") {
          const routeId = msg.id;
          console.log("[renderPages] Got completion for:", routeId);
          completedRoutes.add(routeId);
          if (completedRoutes.size === routes.length) {
            console.log("[renderPages] All streams complete!");
            options.worker.removeListener("message", messageHandler);
            resolve();
          }
        }
      };
      options.worker.on("message", messageHandler);
      console.log("[renderPages] Message handler set up");
    });

    const renderPromises = routes.map(async (route) => {
      console.log("[renderPages] Processing route:", route);
      
      try {
        const result = await createHandler(route, options.pluginOptions, {
          loader: options.loader,
          manifest: options.manifest,
        });

        console.log("[renderPages] Handler result:", {
          route,
          type: result.type,
          hasStream: result.type === "success"
        });

        if (result.type !== "success") {
          console.log("[renderPages] Handler failed:", result);
          return;
        }

        const htmlOutputPath = route === '/' 
          ? join(htmlRoot, 'index.html')  // Root route
          : join(htmlRoot, route, 'index.html');  // Other routes
        console.log("[renderPages] HTML output path:", htmlOutputPath);

        // Create a promise that resolves when the worker completes
        const streamPromise = new Promise<void>((resolve, reject) => {
          const transform = new Transform({
            transform(chunk, _encoding, callback) {
              console.log("[renderPages] Transforming chunk for route:", route);
              options.worker.postMessage({
                type: "RSC_CHUNK",
                id: route,
                chunk: chunk,
                moduleBasePath: options.moduleBasePath,
                moduleBaseURL: options.moduleBaseURL,
                htmlOutputPath,
                outDir: options.outDir,
                pipableStreamOptions: options.pipableStreamOptions ?? {},
              } satisfies WorkerRscChunkMessage);
              callback(null, chunk);
            },
            flush(callback) {
              console.log("[renderPages] Flushing stream for route:", route);
              options.worker.postMessage({
                type: "RSC_END",
                id: route,
              });
              callback();
            }
          });

          const cleanup = () => {
            transform.destroy();
          };

          result.stream?.pipe(transform);
        });

        await streamPromise;

      } catch (error) {
        failedRoutes.set(route, error as Error);
      }
    });

    await Promise.all(renderPromises);
    await allStreamsComplete;

  } finally {
    // Clean up worker
    await options.worker.terminate();
  }

  return {
    failedRoutes,
    filesOutputted
  };
}
