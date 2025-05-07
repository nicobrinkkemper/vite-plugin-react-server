// Check environment before any imports
if (process.env["NODE_ENV"] !== "production") {
  process.exit(1);
}

import { parentPort } from "node:worker_threads";
import { messageHandler } from "./messageHandler.js";

if (!parentPort) {
  throw new Error("This module must be run as a worker");
}


// Handle incoming messages
parentPort.on("message", messageHandler);

// Signal ready
parentPort.postMessage({ type: "READY", env: process.env["NODE_ENV"] });
