import type { HtmlWorkerOutputMessage } from "./types.js";
import { parentPort } from "node:worker_threads";

export function sendMessage(msg: HtmlWorkerOutputMessage, port = parentPort) {
    // Send the original message
    if('error' in msg && msg.error instanceof Error) {
      port?.postMessage({
        ...msg,
        error: {
          message: msg.error.message,
          stack: msg.error.stack,
          name: msg.error.name,
          cause: msg.error.cause,
        },
      });
    } else {
      port?.postMessage(msg);
    }
  }