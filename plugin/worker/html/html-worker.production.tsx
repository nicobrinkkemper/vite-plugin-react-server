import { messageHandler } from "./messageHandler.js";
import { parentPort, workerData, MessagePort } from "node:worker_threads";
// Mark shared resources as untransferable
if (workerData && typeof workerData === 'object') {
  Object.values(workerData).forEach(value => {
    if (value && typeof value === 'object') {
      try {
        if (typeof (value as any).markAsUntransferable === 'function') {
          (value as any).markAsUntransferable();
        }
      } catch (e) {
        // Ignore errors if markAsUntransferable is not available
      }
    }
  });
}

// Set up message handler
parentPort?.on("message", messageHandler);

// Signal ready with environment
parentPort?.postMessage({
  type: "READY",
  env: process.env["NODE_ENV"],
  pid: process.pid,
});