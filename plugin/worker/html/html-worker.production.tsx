import { messageHandler } from "./messageHandler.js";
import { parentPort } from "node:worker_threads";

if (!parentPort) throw new Error("This module must be run as a worker");

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