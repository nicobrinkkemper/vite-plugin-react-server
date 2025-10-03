import { configureRequestHandler } from "./configureRequestHandler.client.js";
import { MessageChannel } from "node:worker_threads";
import type { CreateReactWorkerServerFn } from "./types.js";


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

    // Configure the worker request handler (sets up middleware)
    configureRequestHandler({
      server,
      autoDiscoveredFiles,
      userOptions,
      configEnv,
      hmrChannel: (() => {
        const channel = hmrChannel || new MessageChannel();
        // Increase max listeners to prevent warnings during development
        // This is a targeted fix for the memory leak warnings
        (channel.port1 as any).setMaxListeners(20);
        return channel;
      })(),
      serverManifest,
      resolvedConfig,
      onWorkerCreated:
        onWorkerCreated ||
        (() => {
          // Default worker created handler
        }),
    });
  };
