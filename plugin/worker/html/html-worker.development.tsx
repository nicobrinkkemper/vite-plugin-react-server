import { messageHandler } from "./messageHandler.js";
import { parentPort, workerData } from "node:worker_threads";
import type { ReadyMessage } from "../types.js";
import { createPluginLogger } from "../../helpers/logger.js";

const log = createPluginLogger(workerData.verbose);

function developmentMessageHandler(msg: any) {
  if (log.isDebug) {
    if ("chunk" in msg) {
      let preview = Buffer.from(msg.chunk).toString("utf-8");
      log.debug(`[html-worker:${msg.type}] ${preview}`);
    } else {
      log.debug(`[html-worker:${msg.type}] ${JSON.stringify(msg)}`);
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
