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

    let restartFn: (() => Promise<void>) | null = null;
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
        if (restart) {
          restartFn = restart;
        }
        if (onWorkerCreated) {
          onWorkerCreated(worker, restart);
        }
      },
    });
    
    // Return object with restart function and HMR update sender for hotUpdate
    return {
      restart: restartFn,
      sendHmrUpdate: (file: string, routes?: string[]) => {
        if (currentWorker) {
          // CRITICAL: In development mode, HMR port is disabled, so send directly to worker
          // Send HMR_UPDATE message to worker through parentPort (postMessage)
          const normalizedPath = file.replace(userOptions.projectRoot || server.config.root, '').replace(/^\/+/, '');
          currentWorker.postMessage({
            type: "HMR_UPDATE",
            id: normalizedPath,
            path: file,
            routes: routes || [],
            timestamp: Date.now(),
          } satisfies any);
          
          // Mark that modules have been invalidated - worker will be restarted on next request
          // This is necessary because Node.js caches ES modules and the only way to clear
          // that cache is to restart the worker
          // Use dynamic import to avoid circular dependency
          import("./configureRequestHandler.client.js").then(({ markModulesInvalidated }) => {
            markModulesInvalidated();
          });
          
          if (verbose) {
            logger?.info(`[createReactWorkerServer] Sent HMR_UPDATE for ${file} to worker, marked for restart`);
          }
        }
      },
    };
  };
