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
      console.log("[RSC Worker] Processing HMR_UPDATE for path:", msg.path);
      console.log("[RSC Worker] Affected routes:", msg.routes);
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
    case "HMR_ACCEPT":
      // Clear the invalidation state
      console.log("[RSC Worker] Processing HMR_ACCEPT for path:", msg.path);
      hmrState.delete(msg.path);
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
