import { parentPort } from "node:worker_threads";
import { activeStreams, hmrState } from "./state.js";
import { handleRender } from "./handleRender.js";
import type { RscWorkerInputMessage } from "./types.js";
import { toError } from "../../error/toError.js";
import { handlers } from "./handlers.js";
import { join } from "node:path";
import { workerData } from "node:worker_threads";
import { sendMessage } from "../sendMessage.js";
import { createLogger } from "vite";
import { logError } from "../../error/logError.js";

// In test mode, we want errors to propagate up immediately
const isTestEnv = process.env["VITEST"] || process.env["NODE_ENV"] === "test";
const isDevEnv = process.env["NODE_ENV"] !== "production";

const logger = createLogger(workerData.resolvedConfig.logLevel ?? 'info');

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
        return await handleRender(msg, handlers, logger);
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
      case "MODULE_REQUEST": {
        const { id, path } = msg;
        try {
          const module = await import(join(workerData.userOptions.projectRoot, path));
          handlers.onServerModule(id, path, module);
        } catch (error) {
          handlers.onError(id, toError(error));
        }
        return;
      }
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
        logger.info(`Unknown message: ${msg.type}`);
        return;
      }
    }
  } catch (error) {
    const err = toError(error);
    // In dev mode, try to send error message before exiting
    if (parentPort) {
      sendMessage({
        type: "ERROR",
        id: "rsc-worker",
        error: err,
      }, port);
    }
    if (!isDevEnv || isTestEnv) {
      // In test mode or production mode, just throw the error to fail fast
      throw err;
    } else {
      logError(err, logger);
    }
  }
}
