import { parentPort } from "node:worker_threads";
import { messageHandler } from "./messageHandler.js";
import type { ReadyMessage } from "../types.js";


// Signal ready with environment
parentPort?.postMessage({
  type: "READY",
  id: "html-worker",
  env: process.env["NODE_ENV"],
  pid: process.pid,
} satisfies ReadyMessage);

// Handle MessagePort requests for HTML streaming
parentPort?.on("message", messageHandler);
