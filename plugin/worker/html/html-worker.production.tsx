import { messageHandler } from "./messageHandler.client.js";
import { parentPort } from "node:worker_threads";
import type { ReadyMessage } from "../types.js";

// Signal ready with environment
parentPort?.on("message", messageHandler);
parentPort?.postMessage({
  type: "READY",
  id: "worker/html",
  env: process.env["NODE_ENV"],
  pid: process.pid,
} satisfies ReadyMessage);
