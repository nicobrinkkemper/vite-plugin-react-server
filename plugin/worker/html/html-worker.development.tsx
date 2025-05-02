import { messageHandler } from "./messageHandler.js";
import { parentPort } from "node:worker_threads";
import { register as registerTsx } from "tsx/esm/api";

// Register loaders
registerTsx();

// Signal ready with environment
parentPort?.on("message", messageHandler);
parentPort?.postMessage({
  type: "READY",
  env: process.env["NODE_ENV"],
  pid: process.pid,
});