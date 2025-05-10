import type { ViteDevServer } from "vite";
import type {
  AutoDiscoveredFiles,
  RequestHandler,
  ResolvedUserOptions,
} from "../types.js";
import type {
  RscWorkerOutputMessage,
  RscRenderMessage,
} from "../worker/types.js";
import { join } from "node:path";
import type { Worker as NodeWorker } from "node:worker_threads";
import { MessageChannel } from "node:worker_threads";
import {
  serializedDevServerConfig,
  serializedOptions,
} from "../helpers/serializeUserOptions.js";
import { createWorker } from "../worker/createWorker.js";
import { getRouteFiles } from "../helpers/getRouteFiles.js";

let currentWorker: NodeWorker | null = null;
let isRestarting = false;

async function restartWorker(
  server: ViteDevServer,
  autoDiscoveredFiles: AutoDiscoveredFiles,
  userOptions: ResolvedUserOptions,
  hmrChannel: MessageChannel
) {
  if (isRestarting) return;
  isRestarting = true;

  try {
    // Terminate the current worker if it exists
    if (currentWorker) {
      currentWorker.terminate();
      currentWorker = null;
    }

    const workerResult = await createWorker({
      projectRoot: server.config.root,
      workerPath: userOptions.rscWorkerPath,
      reverseCondition: "react-server",
      currentCondition: "react-client",
      workerData: {
        hmrPort: hmrChannel.port2,
        resolvedConfig: serializedDevServerConfig(server.config),
        userOptions: serializedOptions(userOptions, autoDiscoveredFiles),
      },
      transferList: [hmrChannel.port2],
    });

    if (workerResult.type === "success") {
      currentWorker = workerResult.worker;
      server.config.logger.info("[react-client] Worker restarted successfully");
    } else if (workerResult.type === "error") {
      server.config.logger.error("[react-client] Failed to start worker", {
        error: workerResult.error,
      });
    }
  } finally {
    isRestarting = false;
  }
}

/**
 * Creates an async generator that yields RSC chunks from the worker.
 * Handles both module requests and RSC streaming.
 *
 * @param worker - The worker thread
 * @param server - The Vite dev server
 * @param message - The RSC render message
 * @param rscWorkerLoaderPort - Optional loader port for module loading
 * @returns An async generator that yields RSC chunks
 */
async function* createWorkerStream(
  worker: NodeWorker,
  message: Omit<RscRenderMessage, "type" | "id">
): AsyncGenerator<Uint8Array, void, unknown> {
  let messageHandler: (message: RscWorkerOutputMessage) => void;
  let cleanup: () => void = () => {};

  // First yield: wait for initial message and handle module requests
  yield await new Promise<Uint8Array>((resolve) => {
    messageHandler = (message: RscWorkerOutputMessage) => {
      if (message.type === "RSC_CHUNK") {
        resolve(message.chunk);
      }
      if (message.type === "ERROR") {
        resolve(new Uint8Array());
      }
    };

    cleanup = () => {
      worker.off("message", messageHandler);
    };

    worker.on("message", messageHandler);

    // Send the render message to start the RSC stream
    worker.postMessage({
      type: "RSC_RENDER",
      id: message.route,
      ...message,
    });
  });

  // Subsequent yields: handle RSC chunks until stream ends
  while (true) {
    const chunk = await new Promise<Uint8Array>((resolve) => {
      messageHandler = (message: RscWorkerOutputMessage) => {
        if (message.type === "RSC_END") {
          cleanup();
          resolve(new Uint8Array());
          return;
        }
        if (message.type === "RSC_CHUNK") {
          resolve(message.chunk);
        }
        if (message.type === "ERROR") {
          cleanup();
          resolve(new Uint8Array());
          return;
        }
      };
      worker.once("message", messageHandler);
    });

    if (chunk.length === 0) {
      break;
    }
    yield chunk;
  }
}

/**
 * Handles the RSC stream from the worker.
 * Creates a ReadableStream that pipes RSC chunks to the response.
 *
 * @param worker - The worker thread
 * @param message - The RSC render message
 * @returns A ReadableStream that yields RSC chunks
 */
export function handleWorkerRscStream(
  worker: NodeWorker,
  message: Omit<RscRenderMessage, "type" | "id">
): ReadableStream<Uint8Array> {
  // Create a ReadableStream from the async generator
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of createWorkerStream(worker, message)) {
          controller.enqueue(chunk);
        }
      } catch (error) {
        controller.error(error);
      } finally {
        controller.close();
      }
    },
  });
}

/**
 * Configures the worker request handler.
 * @param server - The Vite dev server
 * @param autoDiscoveredFiles - The auto discovered files
 * @param userOptions - The user options
 */
export async function configureWorkerRequestHandler({
  server,
  autoDiscoveredFiles,
  userOptions,
}: {
  server: ViteDevServer;
  autoDiscoveredFiles: AutoDiscoveredFiles;
  userOptions: ResolvedUserOptions;
}) {
  // Create HMR message channel
  const hmrChannel = new MessageChannel();

  // Set up HMR listeners on the main thread
  server.hot.on("change", async (file: string) => {
    // Restart worker on file change
    await restartWorker(server, autoDiscoveredFiles, userOptions, hmrChannel);

    hmrChannel.port1.postMessage({
      type: "HMR_UPDATE",
      path: file,
    });
  });

  server.hot.on("update", (data: any) => {
    hmrChannel.port1.postMessage({
      type: "HMR_ACCEPT",
      path: data.path,
    });
  });

  // Initial worker creation
  await restartWorker(server, autoDiscoveredFiles, userOptions, hmrChannel);

  // first add all the files to the watcher
  for (const pageProps of autoDiscoveredFiles.urlMap.values()) {
    server.watcher.add(pageProps.page);
    if (pageProps.props) {
      server.watcher.add(pageProps.props);
    }
  }

  const handler: RequestHandler = async (req, res, next: any) => {
    try {
      if (!req.url || req.headers.accept !== "text/x-component") return next();
      if (!currentWorker) {
        // If worker is not available, try to restart it
        await restartWorker(
          server,
          autoDiscoveredFiles,
          userOptions,
          hmrChannel
        );
        if (!currentWorker) {
          return next();
        }
      }

      let route = req.url?.replace('/'+userOptions.build.rscOutputPath, "");
      if (!route || route === "") route = "/";
      // in the case of the no build.pages and a async Page and or props userOption, we need to await those
      // if they are already autoDiscovered then the promise will resolve immediately
      const routeFiles = await getRouteFiles(
        route,
        autoDiscoveredFiles,
        userOptions
      );
      if (routeFiles.type === "error") {
        server.config.logger.error("[react-client] Error getting route files", {
          error: routeFiles.error,
        });
        return next();
      }
      const { page, props } = routeFiles;

      // Set up response headers for streaming
      res.setHeader("Content-Type", "text/x-component; charset=utf-8");
      res.setHeader("Transfer-Encoding", "chunked");
      res.setHeader("Connection", "keep-alive");
      let timeout = setTimeout(() => {
        server.config.logger.error("[react-client] RSC render timeout");
        res.end();
      }, 5000);
      const serializedUserOptions = serializedOptions(
        userOptions,
        autoDiscoveredFiles
      );
      const stream = handleWorkerRscStream(currentWorker, {
        ...serializedUserOptions,
        // we make the worker stream aware of the route, pagePath, propsPath
        route,
        pagePath: page,
        propsPath: props,
        // override these at all times to ensure the settings will work for the dev server
        projectRoot: server.config.root,
        moduleRootPath: join(server.config.root, userOptions.moduleBase),
        moduleBaseURL: "",
        moduleBasePath: "",
        build: serializedUserOptions.build,
        manifest: autoDiscoveredFiles.staticManifest,
        cssFiles: new Map(),
      });

      // Pipe the stream to the response
      stream.pipeTo(
        new WritableStream({
          write(chunk) {
            res.write(chunk);
          },

          close() {
            clearTimeout(timeout);
            res.end();
          },
          abort() {
            clearTimeout(timeout);
            // Restart worker on error
            restartWorker(server, autoDiscoveredFiles, userOptions, hmrChannel);
            res.end();
          },
        })
      );
    } catch (error) {
      if (error instanceof Error) {
        server.config.logger.error("[react-client] Error handling request", {
          error,
        });
      }
    }
  };
  // attach handler to the server
  server.middlewares.use(handler);
  // done
}
