import { messageHandler } from "./messageHandler.js";
import { parentPort } from "node:worker_threads";

if (!parentPort) throw new Error("This module must be run as a worker");
parentPort?.on("message", messageHandler);

// Signal ready with environment
parentPort?.postMessage({ type: "READY", env: process.env["NODE_ENV"] });