import type {
  PagePropOpt,
  InlineCssOpt,
  SerializedUserOptions,
  AsOpt,
  PageName,
  PropsName,
} from "../../types.js";

import type { ViteDevServer } from "vite";
import type { AutoDiscoveredFiles } from "../../types.js";
import { createWorker } from "../worker/createWorker.js";
import { serializedDevServerConfig } from "../helpers/serializeUserOptions.js";
import { MessageChannel, type Worker } from "node:worker_threads";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import React from "react";

let currentWorker: Worker | null = null;
let isRestarting = false;

export type RestartWorkerFn = (props: {
  server: ViteDevServer;
  autoDiscoveredFiles: AutoDiscoveredFiles;
  userOptions: SerializedUserOptions;
  hmrChannel: MessageChannel;
}) => Promise<Worker | null>;

export const restartWorker: RestartWorkerFn = async function _restartWorker({
  server,
  autoDiscoveredFiles,
  userOptions,
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

    const workerResult = await createWorker({
      projectRoot: server.config.root,
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
        reactVersion: React.version,
        id: "worker/rsc",
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
      server.config.logger.error("Failed to start rsc-worker", {
        error: workerResult.error,
      });
      throw workerResult.error;
    }
  } finally {
    isRestarting = false;
  }

  return currentWorker;
};
