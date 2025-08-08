import type { ConfigureWorkerRequestHandlerFn } from "../react-client/types.js";
import { handleError } from "../error/handleError.js";
import { configureReactServer } from "./configureReactServer.server.js";

/**
 * Server version of configureRequestHandler - delegates to react-server's configureReactServer
 */
export const configureRequestHandler: ConfigureWorkerRequestHandlerFn = async function _configureRequestHandler({
  server,
  autoDiscoveredFiles,
  userOptions,
  serverManifest,
  resolvedConfig,
  hmrChannel,
  onWorkerCreated,
}) {
  try {
    if (server.config.logger) {
      server.config.logger.info("[configureRequestHandler:server] Delegating to react-server configureReactServer");
    }

    // In server mode, delegate to react-server's configureReactServer
    // This handles requests directly without workers
    configureReactServer({
      server,
      autoDiscoveredFiles,
      userOptions,
      serverManifest,
      resolvedConfig,
      hmrChannel,
      onWorkerCreated,
    });
  } catch (error) {
    const panicError = handleError({
      error,
      logger: server.config.logger,
      panicThreshold: "none",
      context: "configureRequestHandler.server",
    });
    
    if (panicError) {
      throw panicError;
    }
    
    throw error;
  }
}; 