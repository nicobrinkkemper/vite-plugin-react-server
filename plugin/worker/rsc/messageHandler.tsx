import { parentPort } from "node:worker_threads";
import {
  activeStreams,
  hmrState,
} from "./state.js";
import { handleRender } from "./handleRender.js";
import type {
  RscWorkerInputMessage,
} from "../types.js";
import { toError } from "../../error/toError.js";
import { handlers } from "./handlers.js";

// In test mode, we want errors to propagate up immediately
const isTestEnv = process.env["VITEST"] || process.env["NODE_ENV"] === "test";
const isDevEnv = process.env["NODE_ENV"] !== "production";


export async function messageHandler(
  msg: RscWorkerInputMessage,
  port = parentPort
) {
  try {
    if (!port) {
      throw new Error("No port found");
    }
    switch (msg.type) {
      case "RSC_RENDER":
        return await handleRender(msg, handlers);
      case "SERVER_ACTION":
        return handlers.onServerAction(msg.id, msg.args);
      case "INITIALIZED_REACT_LOADER":
      case "INITIALIZED_CSS_LOADER":
      case "INITIALIZED_ENV_LOADER":
        return;
      case "HMR_UPDATE":
        // Mark the module as invalidated
        hmrState.set(msg.id, {
          timestamp: msg.timestamp || Date.now(),
          invalidated: true,
          routes: msg.routes || [],
        });
        // Notify the main thread that we've processed the update
        handlers.onHmrUpdate(msg.id, msg.routes || []);
        return;
      case "HMR_CLEANUP":
        // Clear the invalidation state
        hmrState.delete(msg.id);
        // Notify the main thread that we've processed the cleanup
        handlers.onHmrAccept(msg.id, msg.routes || []);
        return;
      case "CSS_FILE":
        handlers.onCssFile(msg.id, msg.content);
        return;
      case "SERVER_MODULE":
        handlers.onServerModule(msg.id, msg.url, msg.source);
        return;
      case "SHUTDOWN": {
        // If id is "*", clean up all render states
        if (msg.id === "*") {
          activeStreams.forEach((stream, renderId) => {
            stream.end();
            activeStreams.delete(renderId);
          });
          parentPort?.removeAllListeners();
        } else {
          activeStreams.delete(msg.id);
        }
        handlers.onShutdown(msg.id);
        return;
      }
      default: {
        // Unknown message types are silently ignored
        return;
      }
    }
  } catch (error) {
    const err = toError(error);
    if (isDevEnv) {
      console.error(err);
    }
    // In dev mode, try to send error message before exiting
    if (parentPort) {
      port?.postMessage({
        type: "ERROR",
        id: "rsc-worker",
        error: err,
      });
    }
    if (!isDevEnv || isTestEnv) {
      // In test mode or production mode, just throw the error to fail fast
      throw err;
    }
  }
}
