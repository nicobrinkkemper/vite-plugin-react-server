import { messageHandler } from "./messageHandler.js";
import { parentPort, workerData } from "node:worker_threads";
import type { ReadyMessage } from "../types.js";

const verbose = workerData.verbose;

function developmentMessageHandler(msg: any) {
  if (verbose) {
    if ("chunk" in msg) {
      let preview = Buffer.from(msg.chunk).toString("utf-8");
      console.log(`[html-worker:${msg.type}] ${preview}`);
    } else {
      console.log(`[html-worker:${msg.type}] ${JSON.stringify(msg)}`);
    }
  }
  messageHandler(msg);
}

// Signal ready with environment
parentPort?.on("message", developmentMessageHandler);
parentPort?.postMessage({
  type: "READY",
  id: "html-worker",
  env: process.env["NODE_ENV"],
  pid: process.pid,
} satisfies ReadyMessage);
