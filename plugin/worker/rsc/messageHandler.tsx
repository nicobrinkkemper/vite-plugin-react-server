import { parentPort, workerData } from "node:worker_threads";
import {
  activeStreams,
  addCssFileContent,
  hmrState,
  addModuleId,
} from "./state.js";
import { handleRender } from "./handleRender.js";
import type {
  RscWorkerInputMessage,
  StreamHandlers,
} from "../types.js";
import { sendRscWorkerMessage } from "../sendMessage.js";
import { toError } from "../../error/toError.js";

// In test mode, we want errors to propagate up immediately
const isTestEnv = process.env["VITEST"] || process.env["NODE_ENV"] === "test";
const isDevEnv = process.env["NODE_ENV"] !== "production";

const handlers: Required<StreamHandlers> = {
  onError: (id, error, errorInfo) => {
    sendRscWorkerMessage({
      type: "ERROR",
      id: id,
      errorInfo,
      error: toError(error),
    });
    sendRscWorkerMessage({
      type: "RSC_END",
      id: id,
    });
  },
  onData: (id, data: any) => {
    sendRscWorkerMessage({
      type: "RSC_CHUNK",
      id: id,
      chunk: data,
    });
  },
  onEnd: (id: string) => {
    sendRscWorkerMessage({
      type: "RSC_END",
      id: id,
    });
  },
  onMetrics: (id: string, metrics: any) => {
    sendRscWorkerMessage({
      type: "RSC_METRICS",
      id: id,
      metrics,
    });
  },
  onHmrAccept: (id, routes) => {
    sendRscWorkerMessage({
      type: "HMR_ACCEPT",
      id: id,
      routes: routes,
    });
  },
  onHmrUpdate: (id, routes) => {
    sendRscWorkerMessage({
      type: "HMR_UPDATE",
      id: id,
      routes: routes,
    });
  },
  onServerModule: (id, url, source) => {
    sendRscWorkerMessage({
      type: "SERVER_MODULE",
      id,
      url,
      source,
    });
  },
  onServerActionResponse: (id, result, error) => {
    sendRscWorkerMessage({
      type: "SERVER_ACTION_RESPONSE",
      id,
      result,
      error,
    });
  },
  onServerAction: async (id, args) => {
    try {
      // Get the server action function from the worker data
      const serverAction = workerData.serverActions?.[id];
      if (!serverAction) {
        throw new Error(`Server action ${id} not found`);
      }
      // Execute the server action
      const result = await serverAction(...args);
      // Send the result back
      sendRscWorkerMessage({
        type: "SERVER_ACTION_RESPONSE",
        id,
        result,
      });
    } catch (error) {
      // Send error back
      sendRscWorkerMessage({
        type: "SERVER_ACTION_RESPONSE",
        id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
  onShutdown: (id: string) => {
    // Send SHUTDOWN_COMPLETE message to signal that shutdown is complete
    sendRscWorkerMessage({
      type: "SHUTDOWN_COMPLETE",
      id: id,
    });
  },
};

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
        return;
      case "INITIALIZED_CSS_LOADER":
        return;
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
        if (msg.id) {
          const cssOptions = workerData.userOptions.css || {
            inlineThreshold: 1000,
          };

          addCssFileContent(msg.id, msg.content, {
            projectRoot: workerData.userOptions.projectRoot || process.cwd(),
            moduleBaseURL: workerData.userOptions.moduleBaseURL || "/",
            moduleBasePath: workerData.userOptions.moduleBasePath || "/",
            moduleRootPath: workerData.userOptions.moduleRootPath,
            css: cssOptions,
          });
        }
        return;
      case "SERVER_MODULE":
        if (msg.id && msg.url) {
          addModuleId(msg.id, msg.url);
        }
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
        console.log("Unknown message", msg);
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
