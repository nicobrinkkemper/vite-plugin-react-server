import { createWorker } from "../worker/createWorker.js";
import { serializedDevServerConfig } from "../helpers/serializeUserOptions.js";
import { MessageChannel, type Worker } from "node:worker_threads";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { React } from "../vendor/vendor.client.js";
import type { RestartWorkerFn } from "../react-client/types.js";
import { getNodeEnv } from "../config/getNodeEnv.js";
import { handleError } from "../error/handleError.js";

let currentWorker: Worker | null = null;
let isRestarting = false;

export const restartWorker: RestartWorkerFn = async function _restartWorker({
  server,
  autoDiscoveredFiles,
  userOptions,
  configEnv,
  hmrChannel,
}) {
  if (isRestarting) {
    return currentWorker;
  }
  isRestarting = true;

  try {
    // Terminate the current worker if it exists
    if (currentWorker) {
      currentWorker.removeAllListeners();
      currentWorker = null;
    }

    const routeCount = autoDiscoveredFiles.urlMap.size;
    const hmrBuffer = 20; // Buffer for HMR and other operations
    const maxListeners = routeCount + hmrBuffer;

    // Create a new MessageChannel for this worker
    const workerHmrChannel = new MessageChannel();

    // Forward messages from the plugin's HMR channel to the worker's channel
    hmrChannel.port1.addEventListener("message", (event: Event) => {
      workerHmrChannel.port1.postMessage((event as MessageEvent).data);
    });

    if (userOptions.verbose) {
      server.config.logger.info(`[restartWorker] userOptions.projectRoot: ${userOptions.projectRoot}`);
      server.config.logger.info(`[restartWorker] server.config.root: ${server.config.root}`);
      server.config.logger.info(`[restartWorker] Using projectRoot: ${userOptions.projectRoot || server.config.root}`);
    }

    const workerResult = await createWorker({
      projectRoot: userOptions.projectRoot || server.config.root,
      workerPath: userOptions.rscWorkerPath,
      reverseCondition: "react-server",
      currentCondition: "react-client",
      maxListeners: maxListeners,
      envPrefix:
        typeof server.config.envPrefix === "string"
          ? server.config.envPrefix
          : Array.isArray(server.config.envPrefix)
          ? server.config.envPrefix[0]
          : DEFAULT_CONFIG.ENV_PREFIX,
      workerData: {
        userOptions: userOptions,
        resolvedConfig: serializedDevServerConfig(server.config),
        configEnv: configEnv,
        reactVersion: React.version,
        id: "worker/rsc",
        serverManifest: {}, // staticManifest removed from AutoDiscoveredFiles
      },
      transferList: [workerHmrChannel.port2],
    });
    
    if (workerResult.type === "success") {
      currentWorker = workerResult.worker;
      if (userOptions.verbose)
        server.config.logger.info(
          `[react-client] Set max listeners to ${maxListeners} for ${routeCount} routes`
        );
    } else if (workerResult.type === "error") {
      const panicError = handleError({
        error: workerResult.error,
        logger: server.config.customLogger || server.config.logger,
        mode: getNodeEnv(server.config.mode),
        panicThreshold: userOptions.panicThreshold,
        critical: false,
        context: "restartWorker",
      });
      if (panicError != null) {
        throw panicError;
      }
    }
  } finally {
    isRestarting = false;
  }

  return currentWorker;
};
