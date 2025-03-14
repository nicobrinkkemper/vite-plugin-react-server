import { messageHandler } from "./messageHandler.js";
import { parentPort, workerData, MessagePort } from "node:worker_threads";

if (!parentPort) throw new Error("This module must be run as a worker");

// Mark shared resources as untransferable
if (workerData && typeof workerData === 'object') {
  Object.values(workerData).forEach(value => {
    if (value && typeof value === 'object') {
      (parentPort as MessagePort & { markAsUntransferable: (obj: any) => void }).markAsUntransferable(value);
    }
  });
}

// Signal ready with environment
parentPort?.on("message", messageHandler);
parentPort?.postMessage({
  type: "READY",
  env: process.env["NODE_ENV"],
  pid: process.pid,
});

if (process.env["NODE_ENV"] !== "production") {
  throw new Error("This module must be run in development mode");
}