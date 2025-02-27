import { messageHandler } from "./messageHandler.js";
import { parentPort } from "node:worker_threads";

let ready = false;
if (!parentPort) throw new Error("This module must be run as a worker");

// Signal ready with environment
parentPort?.on("message", messageHandler);
parentPort?.postMessage({ 
    type: "READY", 
    env: process.env["NODE_ENV"],
    pid: process.pid 
});
