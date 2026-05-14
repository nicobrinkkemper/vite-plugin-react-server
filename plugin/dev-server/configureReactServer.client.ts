import { configureRequestHandler } from "./configureRequestHandler.client.js";
import { MessageChannel } from "node:worker_threads";
import type { CreateReactWorkerServerFn } from "./types.js";
import { setMaxListenersOnPort, unrefPort } from "../stream/setMaxListeners.js";


/**
 * Creates a React Worker Server that configures worker-based rendering
 * Sets up middleware, HMR, and worker management like react-client/plugin.client.ts
 */
export const configureReactServer: CreateReactWorkerServerFn =
  function _createReactWorkerServer({
    server,
    autoDiscoveredFiles,
    userOptions,
    configEnv,
    hmrChannel,
    onWorkerCreated,
    serverManifest,
    resolvedConfig,
  }) {
    const logger = server.config.customLogger || server.config.logger;
    const verbose = userOptions.verbose || false;

    if (verbose) {
      logger?.info(
        `[createReactWorkerServer] Configuring worker-based rendering`
      );
    }

    // Set up restart listener for worker cleanup
    server.ws.on("restart", async () => {
      logger?.info(
        "[createReactWorkerServer] Server restarting, shutting down worker..."
      );
      // Worker cleanup would be handled by the worker management
    });

    let currentWorker: any = null;

    // Configure the worker request handler (sets up middleware)
    const effectiveHmrChannel = (() => {
      const channel = hmrChannel || new MessageChannel();
      // Increase max listeners to prevent warnings during development
      // This is a targeted fix for the memory leak warnings
      // We need to set this on BOTH ports because listeners can be added to either side
      // Use a high default (500) to accommodate large projects with many routes
      // restartWorker will adjust this based on actual route count
      const initialMaxListeners = 500;
      setMaxListenersOnPort(channel.port1, initialMaxListeners);
      setMaxListenersOnPort(channel.port2, initialMaxListeners);
      unrefPort(channel.port1);
      unrefPort(channel.port2);
      return channel;
    })();

    configureRequestHandler({
      server,
      autoDiscoveredFiles,
      userOptions,
      configEnv,
      hmrChannel: effectiveHmrChannel,
      serverManifest,
      resolvedConfig,
      onWorkerCreated: (worker: any, restart?: () => Promise<void>) => {
        currentWorker = worker;
        if (onWorkerCreated) {
          onWorkerCreated(worker, restart);
        }
      },
    });

    return {
      sendHmrUpdate: (file: string, routes?: string[]) => {
        if (currentWorker) {
          // Notify the worker that a file changed. The worker's HMR_UPDATE
          // handler invalidates the ModuleRunner cache so the next import
          // re-fetches transformed code through Vite's pipeline.
          const normalizedPath = file.replace(userOptions.projectRoot || server.config.root, '').replace(/^\/+/, '');
          currentWorker.postMessage({
            type: "HMR_UPDATE",
            id: normalizedPath,
            path: file,
            routes: routes || [],
            timestamp: Date.now(),
          } satisfies any);

          if (verbose) {
            logger?.info(`[createReactWorkerServer] Sent HMR_UPDATE for ${file} to worker`);
          }
        }
      },
    };
  };
