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
import { serializeResolvedConfig, serializeUserOptions } from "../helpers/serializeUserOptions.js";
import { createWorker } from "../worker/createWorker.js";
import { getRouteFiles } from "../helpers/getRouteFiles.js";


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
  message: Omit<RscRenderMessage, "type" | "id">,
): AsyncGenerator<Uint8Array, void, unknown> {
  let messageHandler: (message: RscWorkerOutputMessage) => void;
  let cleanup: () => void = () => {};

  try {
    // First yield: wait for initial message and handle module requests
    yield await new Promise<Uint8Array>((resolve, reject) => {
      messageHandler = (message: RscWorkerOutputMessage) => {

        // Handle RSC stream messages
        if (message.type === "RSC_END") {
          cleanup();
          resolve(new Uint8Array());
          return;
        }
        if (message.type === "RSC_CHUNK") {
          resolve(message.chunk);
        }
        if(message.type === "ERROR") {
          if(typeof message.error === "string") {
            reject(new Error(message.error));
          } else if (typeof message.error === "object") {
            const err = new Error(message.error.message);
            err.stack = message.error.stack;
            err.name = message.error.name;
            err.cause = message.error.cause;
            reject(err);
          } else {
            console.log("Unknown error type", message);
            reject(message.error);
          }
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
      const chunk = await new Promise<Uint8Array>((resolve, reject) => {
        messageHandler = (message: RscWorkerOutputMessage) => {
          if (message.type === "RSC_END") {
            cleanup();
            resolve(new Uint8Array());
            return;
          }
          if (message.type === "RSC_CHUNK") {
            resolve(message.chunk);
          }
        };
        worker.once("message", messageHandler);
      });

      if (chunk.length === 0) {
        break;
      }
      yield chunk;
    }
  } finally {
    cleanup();
  }
}

/**
 * Handles the RSC stream from the worker.
 * Creates a ReadableStream that pipes RSC chunks to the response.
 *
 * @param worker - The worker thread
 * @param server - The Vite dev server
 * @param message - The RSC render message
 * @param rscWorkerLoaderPort - Optional loader port for module loading
 * @returns A ReadableStream that yields RSC chunks
 */
export function handleWorkerRscStream(
  worker: NodeWorker,
  server: ViteDevServer,
  message: Omit<RscRenderMessage, "type" | "id">,
): ReadableStream<Uint8Array> {
  // Create a ReadableStream from the async generator
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of createWorkerStream(
          worker,
          message,
        )) {
          controller.enqueue(chunk);
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

/**
 * Configures the worker request handler.
 * @param server - The Vite dev server
 * @param autoDiscoveredFiles - The auto discovered files
 * @param userOptions - The user options
 * @param worker - The worker thread
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
  server.hot.on('change', (file: string) => {
    hmrChannel.port1.postMessage({
      type: 'HMR_UPDATE',
      path: file
    });
  });

  server.hot.on('update', (data: any) => {
    hmrChannel.port1.postMessage({
      type: 'HMR_ACCEPT',
      path: data.path
    });
  });

  const workerResult = await createWorker({
    projectRoot: server.config.root,
    workerPath: userOptions.rscWorkerPath,
    reverseCondition: "react-server",
    currentCondition: "react-client",
    workerData: {
      hmrPort: hmrChannel.port2,
      resolvedConfig: serializeResolvedConfig(server.config),
      userOptions: serializeUserOptions(userOptions, autoDiscoveredFiles)
    },
    transferList: [hmrChannel.port2]
  });
  if (workerResult.type === "skip") {
    server.config.logger.warn("Worker creation skipped");
    return;
  } else if (workerResult.type === "error") {
    server.config.logger.error("Could not create worker at " + workerResult.workerPath, {error: workerResult.error});
    throw workerResult.error;
  }
  // first add all the files to the watcher
  for (const pageProps of autoDiscoveredFiles.urlMap.values()) {
    server.watcher.add(pageProps.page);
    if (pageProps.props) {
      server.watcher.add(pageProps.props);
    }
  }
  const handler: RequestHandler = async (req, res, next: any) => {
    if (!workerResult.worker) return next();
    if (!req.url) return next();

    // Only handle RSC requests
    if (req.headers.accept !== "text/x-component") return next();

    let route = req.url?.replace("/index.rsc", "");
    if (!route || route === "") route = "/";
    // in the case of the no build.pages and a async Page and or props userOption, we need to await those
    // if they are already autoDiscovered then the promise will resolve immediately
    const routeFiles = await getRouteFiles(route, autoDiscoveredFiles, userOptions);
    if(routeFiles.type === "error") {
      server.config.logger.error("[react-client] Error getting route files", {error: routeFiles.error});
      return next();
    }
    const { page, props } = routeFiles;

    // Set up response headers for streaming
    res.setHeader("Transfer-Encoding", "chunked");
    res.setHeader("Connection", "keep-alive");
    let timeout = setTimeout(() => {
      server.config.logger.error("[react-client] RSC render timeout");
      res.end();
    }, 5000);

    const stream = handleWorkerRscStream(
      workerResult.worker,
      server,
      {
        ...serializeUserOptions(userOptions, autoDiscoveredFiles),
        // we make the worker stream aware of the route, pagePath, propsPath
        route,
        pagePath: page,
        propsPath: props,
        // override these at all times to ensure the settings will work for the dev server
        projectRoot: server.config.root,
        moduleRootPath: join(server.config.root, userOptions.moduleBase),
        moduleBaseURL: "",
        moduleBasePath: "",
      },
    );

    // Pipe the stream to the response
    stream.pipeTo(
      new WritableStream({
        write(chunk) {
          clearTimeout(timeout);
          timeout = setTimeout(() => {
            throw new Error("RSC render timeout");
          }, 5000);
          res.write(chunk);
        },
        close() {
          clearTimeout(timeout);
        },
        abort(reason: any) {
          if(reason) {
            server.config.logger.warn("[react-client] RSC stream aborted with message:" + reason);
          } else {
            server.config.logger.error("[react-client] RSC stream aborted without a reason");
          }
        },
      })
    );
  };
  // attach handler to the server
  server.middlewares.use(handler);
  // done
}
