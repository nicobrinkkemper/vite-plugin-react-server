import { createWorker } from "../worker/createWorker.js";
import { cleanupWorker } from "../helpers/workerCleanup.js";
import { serializedDevServerConfig } from "../helpers/serializeUserOptions.js";
import { MessageChannel, type Worker } from "node:worker_threads";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { React } from "../vendor/vendor.client.js";
import type { RestartWorkerFn } from "../react-client/types.js";
import { getNodeEnv } from "../config/getNodeEnv.js";
import { handleError } from "../error/handleError.js";
import { setMaxListenersOnPort, unrefPort } from "../stream/setMaxListeners.js";
import { attachRunnerFetchHandler } from "./handleRunnerFetch.server.js";

let currentWorker: Worker | null = null;
let isRestarting = false;
let currentHmrChannel: MessageChannel | null = null;
let currentMessageHandler: ((event: Event) => void) | null = null;
let currentErrorHandler: ((error: any) => void) | null = null;
let currentRunnerChannel: MessageChannel | null = null;
let currentRunnerDetach: (() => void) | null = null;

const isRunnerEnabled = (): boolean => process.env["VPRS_RUNNER"] !== "0";

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

    // Clean up the runner channel + fetch handler from any prior worker
    if (currentRunnerDetach) {
      currentRunnerDetach();
      currentRunnerDetach = null;
    }
    if (currentRunnerChannel) {
      currentRunnerChannel.port1.close();
      currentRunnerChannel.port2.close();
      currentRunnerChannel = null;
    }

    // Clean up any existing event listeners on the main HMR channel
    if (currentMessageHandler) {
      hmrChannel.port1.removeEventListener("message", currentMessageHandler);
      currentMessageHandler = null;
    }
    if (currentErrorHandler) {
      hmrChannel.port1.removeEventListener("messageerror", currentErrorHandler);
      currentErrorHandler = null;
    }

    const routeCount = autoDiscoveredFiles.urlMap.size;
    const hmrBuffer = 20; // Buffer for HMR and other operations
    const maxListeners = routeCount + hmrBuffer;

    // Create a new MessageChannel for this worker
    const workerHmrChannel = new MessageChannel();
    currentHmrChannel = workerHmrChannel;
    
    // Increase max listeners to prevent warnings during development
    setMaxListenersOnPort(workerHmrChannel.port1, maxListeners);
    setMaxListenersOnPort(workerHmrChannel.port2, maxListeners);
    unrefPort(workerHmrChannel.port1);
    unrefPort(workerHmrChannel.port2);

    // Forward messages from the plugin's HMR channel to the worker's channel
    const messageHandler = (event: Event) => {
      try {
        workerHmrChannel.port1.postMessage((event as MessageEvent).data);
      } catch (error) {
        // Ignore HMR errors for now to avoid DataCloneError
        if (userOptions.verbose) {
          server.config.logger.info(`[restartWorker] HMR message error: ${error}`);
        }
      }
    };

    // Handle HMR channel errors
    const errorHandler = (error: any) => {
      if (userOptions.verbose) {
        server.config.logger.warn(`[restartWorker] HMR message error: ${error}`);
      }
    };

        // Store handlers for cleanup
        currentMessageHandler = messageHandler;
        currentErrorHandler = errorHandler;

        // Increase max listeners to prevent warnings during development
        // This is a targeted fix for the memory leak warnings
        setMaxListenersOnPort(hmrChannel.port1, maxListeners);

        hmrChannel.port1.addEventListener("message", messageHandler);
        hmrChannel.port1.addEventListener("messageerror", errorHandler);

    if (userOptions.verbose) {
      server.config.logger.info(`[restartWorker] userOptions.projectRoot: ${userOptions.projectRoot}`);
      server.config.logger.info(`[restartWorker] server.config.root: ${server.config.root}`);
      server.config.logger.info(`[restartWorker] Using projectRoot: ${userOptions.projectRoot || server.config.root}`);
      server.config.logger.info(`[restartWorker] configEnv.command: ${configEnv?.command}`);
      server.config.logger.info(`[restartWorker] configEnv.mode: ${configEnv?.mode}`);
    }

    let runnerPortForWorker: MessageChannel["port2"] | undefined;
    const transferList: any[] = [workerHmrChannel.port2];
    if (isRunnerEnabled()) {
      const runnerChannel = new MessageChannel();
      currentRunnerChannel = runnerChannel;
      setMaxListenersOnPort(runnerChannel.port1, maxListeners);
      setMaxListenersOnPort(runnerChannel.port2, maxListeners);
      unrefPort(runnerChannel.port1);
      unrefPort(runnerChannel.port2);
      const logger = server.config.customLogger || server.config.logger;
      currentRunnerDetach = attachRunnerFetchHandler(
        runnerChannel.port1,
        server,
        logger,
        Boolean(userOptions.verbose)
      );
      runnerPortForWorker = runnerChannel.port2;
      transferList.push(runnerChannel.port2);
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
        runnerPort: runnerPortForWorker,
      },
      transferList,
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
