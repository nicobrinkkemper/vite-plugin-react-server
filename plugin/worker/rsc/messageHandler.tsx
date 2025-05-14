import { parentPort, workerData } from "node:worker_threads";
import { addCssFileContent, hmrState } from "./state.js";
import { handleRender } from "./handleRender.js";
import type { RscWorkerOutputMessage, StreamHandlers } from "../types.js";

export async function messageHandler(msg: any, port = parentPort) {
  if (!port) {
    throw new Error("No port found");
  }
  const handlers: StreamHandlers = {
    onError: (error: any, errorInfo?: any) => {
      if (!(error instanceof Error)) {
        error = new Error(String(error));
      }
      port.postMessage({
        type: "ERROR",
        id: msg.id,
        errorInfo,
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
          cause: error.cause,
        },
      } satisfies RscWorkerOutputMessage);
      port.postMessage({
        type: "RSC_END",
        id: msg.id,
      } satisfies RscWorkerOutputMessage);
    },
    onData: (data: any) => {
      port.postMessage({
        type: "RSC_CHUNK",
        id: msg.id,
        chunk: data,
      } satisfies RscWorkerOutputMessage);
    },
    onEnd: () => {
      port.postMessage({
        type: "RSC_END",
        id: msg.id,
      } satisfies RscWorkerOutputMessage);
    },
    onMetrics: (metrics: any) => {
      port.postMessage({
        type: "RSC_METRICS",
        id: msg.id,
        metrics,
      } satisfies RscWorkerOutputMessage);
    },
  };
  switch (msg.type) {
    case "RSC_RENDER":
      return await handleRender(msg, handlers);
    case "INITIALIZED_REACT_LOADER":
      return;
    case "INITIALIZED_CSS_LOADER":
      return;
    case "HMR_UPDATE":
      // Mark the module as invalidated
      hmrState.set(msg.path, {
        timestamp: msg.timestamp || Date.now(),
        invalidated: true,
        routes: msg.routes || [],
      });
      // Notify the main thread that we've processed the update
      port.postMessage({
        type: "HMR_ACCEPT",
        path: msg.path,
        routes: msg.routes,
      });
      return;
    case "HMR_CLEANUP":
      // Clear the invalidation state
      hmrState.delete(msg.path);
      // Notify the main thread that we've processed the cleanup
      port.postMessage({
        type: "HMR_ACCEPT",
        path: msg.path,
      });
      return;
    case "CSS_FILE":
      if (msg.id) {
        const cssOptions = workerData.userOptions.css || {
          inlineThreshold: 1000,
        };

        addCssFileContent(msg.id, msg.content, {
          projectRoot: workerData.userOptions.projectRoot || process.cwd(),
          moduleBaseURL: workerData.userOptions.moduleBaseURL || "",
          moduleBasePath: workerData.userOptions.moduleBasePath || "",
          moduleRootPath: workerData.userOptions.moduleRootPath || "",
          css: cssOptions,
        });
      }
      return;
    default: {
      console.log("Unknown message", msg);
      return;
    }
  }
}
