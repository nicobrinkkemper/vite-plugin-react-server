import { parentPort } from "node:worker_threads";
import { messageHandler } from "./messageHandler.client.js";
import type { ReadyMessage } from "../types.js";


// Signal ready with environment
parentPort?.postMessage({
  type: "READY",
  id: "worker/html",
  env: process.env["NODE_ENV"],
  pid: process.pid,
} satisfies ReadyMessage);

// Handle MessagePort requests for HTML streaming
parentPort?.on("message", messageHandler);
