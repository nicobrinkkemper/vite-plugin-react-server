import { messageHandler } from "./messageHandler.js";
import { parentPort, workerData } from "node:worker_threads";
import type { ReadyMessage } from "../types.js";
import type { HtmlWorkerInputMessage } from "./types.js";
import { createLogger } from "vite";

const verbose = Boolean(workerData.verbose);
const logger = createLogger(workerData.resolvedConfig.logLevel ?? "info");

function developmentMessageHandler(msg: HtmlWorkerInputMessage) {
  if (verbose) {
    if (msg.type === "RSC_CHUNK") {
      const preview = Buffer.from(msg.chunk).toString("utf-8");
      logger.info(`[html-worker:${msg.type}] ${preview}`);
    } else {
      logger.info(`[html-worker:${msg.type}] ${JSON.stringify(msg)}`);
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
