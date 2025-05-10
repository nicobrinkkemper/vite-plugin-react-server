import { parentPort, workerData, type MessagePort } from "node:worker_threads";
import { addCssFileContent, hmrState } from "./state.js";
import { handleRender } from "./handleRender.js";

export function messageHandler(
  msg: any,
  port = parentPort,
  reactLoaderPort: MessagePort,
  cssLoaderPort: MessagePort
) {
  if (!port) {
    throw new Error("No port found");
  }
  switch (msg.type) {
    case "RSC_RENDER":
      return handleRender(msg, port, reactLoaderPort, cssLoaderPort);
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
      return;
    }
  }
}
