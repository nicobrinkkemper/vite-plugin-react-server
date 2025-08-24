import { messageHandler } from "./messageHandler.js";
import { parentPort } from "node:worker_threads";
import type { ReadyMessage } from "../types.js";

// Signal ready with environment
parentPort?.on("message", (msg) => {
  console.log(`[HTML-WORKER-DEBUG] Received message:`, msg.type, msg.id);
  messageHandler(msg);
});
parentPort?.postMessage({
  type: "READY",
  id: "html-worker",
  env: process.env["NODE_ENV"],
  pid: process.pid,
} satisfies ReadyMessage);
