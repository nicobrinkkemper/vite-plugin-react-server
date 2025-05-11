import type { ResolvedUserOptions } from "../../types.js";

import type { ViteDevServer } from "vite";
import type { AutoDiscoveredFiles } from "../../types.js";
import { createWorker } from "../worker/createWorker.js";
import { serializedDevServerConfig } from "../helpers/serializeUserOptions.js";
import { serializedOptions } from "../helpers/serializeUserOptions.js";
import type { MessageChannel, Worker } from "node:worker_threads";

let currentWorker: Worker | null = null;
let isRestarting = false;

export async function restartWorker(
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
      const routeCount = autoDiscoveredFiles.urlMap.size;
      const hmrBuffer = 20; // Buffer for HMR and other operations
      const maxListeners = routeCount + hmrBuffer;
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
            : "VITE_",
        workerData: {
          hmrPort: hmrChannel.port2,
          resolvedConfig: serializedDevServerConfig(server.config),
          userOptions: serializedOptions(userOptions, autoDiscoveredFiles),
        },
        transferList: [hmrChannel.port2],
      });
  
      if (workerResult.type === "success") {
        currentWorker = workerResult.worker;
        server.config.logger.info(
          `[react-client] Set max listeners to ${maxListeners} for ${routeCount} routes`
        );
      } else if (workerResult.type === "error") {
        server.config.logger.error("Failed to start rsc-worker", {
          error: workerResult.error,
        });
      }
    } finally {
      isRestarting = false;
    }
    return currentWorker;
  }