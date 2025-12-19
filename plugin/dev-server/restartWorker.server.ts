import { createWorker } from "../worker/createWorker.js";
import { cleanupWorker } from "../helpers/workerCleanup.js";
import { serializedDevServerConfig } from "../helpers/serializeUserOptions.js";
import { MessageChannel, type Worker } from "node:worker_threads";
import { React } from "../vendor/vendor.server.js";
import type { RestartWorkerFn } from "../react-client/types.js";
import { getNodeEnv } from "../config/getNodeEnv.js";
import { handleError } from "../error/handleError.js";
import { envPrefixFromConfig } from "../config/envPrefixFromConfig.js";
import { setMaxListenersOnPort } from "../stream/setMaxListeners.js";

let currentWorker: Worker | null = null;
let isRestarting = false;
let currentHmrChannel: MessageChannel | null = null;

export const restartWorker: RestartWorkerFn = async function _restartWorker({
  server,
  autoDiscoveredFiles,
  userOptions,
  configEnv,
  hmrChannel,
}) {
  if (isRestarting) {
    // Wait for the current restart to complete
    while (isRestarting) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    return currentWorker;
  }
  isRestarting = true;

  try {
    // Terminate the current worker if it exists
    cleanupWorker(currentWorker);
    currentWorker = null;

    // Clean up any existing HMR channel
    if (currentHmrChannel) {
      currentHmrChannel.port1.close();
      currentHmrChannel.port2.close();
      currentHmrChannel = null;
    }

    const routeCount = autoDiscoveredFiles.urlMap.size;
    const hmrBuffer = 20; // Buffer for HMR and other operations
    const maxListeners = routeCount + hmrBuffer;

    // Create a new MessageChannel for this worker
    const workerHmrChannel = new MessageChannel();
    currentHmrChannel = workerHmrChannel;
    
    // Increase max listeners to prevent warnings during development
    // We need to set this on BOTH ports because listeners can be added to either side
    setMaxListenersOnPort(workerHmrChannel.port1, maxListeners);
    setMaxListenersOnPort(workerHmrChannel.port2, maxListeners);
    

    // Forward messages from the plugin's HMR channel to the worker's channel
    const messageHandler = (event: Event) => {
      workerHmrChannel.port1.postMessage((event as MessageEvent).data);
    };
    
    hmrChannel.port1.addEventListener("message", messageHandler);

    const workerResult = await createWorker({
      projectRoot: server.config.root,
      workerPath: userOptions.htmlWorkerPath,
      reverseCondition: "react-client",
      currentCondition: "react-server",
      maxListeners: maxListeners,
      envPrefix: envPrefixFromConfig(server.config),
      workerData: {
        userOptions: userOptions,
        resolvedConfig: serializedDevServerConfig(server.config),
        configEnv: configEnv,
        reactVersion: React.version,
        id: "worker/html",
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
