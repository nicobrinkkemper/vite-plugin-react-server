import { messageHandler } from "./messageHandler.js";
import { parentPort } from "node:worker_threads";
import type { ReadyMessage } from "../types.js";

// Signal ready with environment
parentPort?.on("message", messageHandler);
parentPort?.postMessage({
  type: "READY",
  id: "html-worker",
  env: process.env["NODE_ENV"],
  pid: process.pid,
} satisfies ReadyMessage);
